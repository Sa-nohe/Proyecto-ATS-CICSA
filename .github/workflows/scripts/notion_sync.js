// scripts/notion_sync.js
const fs = require("fs");
const path = require("path");
const { Client } = require("@notionhq/client");

const NOTION_TOKEN = process.env.NOTION_TOKEN;
const DATABASE_ID = process.env.NOTION_DATABASE_ID;
const GITHUB_EVENT_PATH = process.env.GITHUB_EVENT_PATH; // viene del workflow
const LOG_PREFIX = "[notion-sync]";

if (!NOTION_TOKEN || !DATABASE_ID) {
  console.error(`${LOG_PREFIX} Faltan NOTION_TOKEN o NOTION_DATABASE_ID en el entorno.`);
  process.exit(1);
}

const notion = new Client({ auth: NOTION_TOKEN });

// Nombres de propiedades en la DB (deben existir tal cual)
const P = {
  TITLE: "Nombre",
  STATUS: "Estado",
  URL: "GitHub URL",
  NUMBER: "Issue Number",
  LABELS: "Etiquetas",
  ASSIGNEE: "Responsable",
  DESCRIPTION: "Descripción",
  CREATED: "Creado",
  UPDATED: "Actualizado"
};

function readEvent() {
  if (GITHUB_EVENT_PATH && fs.existsSync(GITHUB_EVENT_PATH)) {
    const raw = fs.readFileSync(GITHUB_EVENT_PATH, "utf8");
    return JSON.parse(raw);
  }
  if (process.env.GITHUB_EVENT) {
    return JSON.parse(process.env.GITHUB_EVENT);
  }
  throw new Error("No se encontró el payload del evento de GitHub.");
}

function issueToProps(issue) {
  const title = issue.title || "";
  const url = issue.html_url || "";
  const number = issue.number || null;
  const body = issue.body || "";
  const created = issue.created_at || null;
  const updated = issue.updated_at || null;
  const labels = (issue.labels || []).map(l => (typeof l === "string" ? l : l.name)).join(", ");
  const assignees = (issue.assignees || []).map(a => a.login).join(", ");

  const statusName = issue.state === "open" ? "Pendiente" : "Terminado";

  return {
    title, url, number, body, created, updated, labels, assignees, statusName
  };
}

async function queryPageByUrl(url) {
  try {
    const resp = await notion.databases.query({
      database_id: DATABASE_ID,
      filter: {
        property: P.URL,
        url: { equals: url }
      }
    });
    return resp.results && resp.results.length ? resp.results[0] : null;
  } catch (err) {
    console.error(`${LOG_PREFIX} Error query DB:`, err.body || err);
    throw err;
  }
}

function buildNotionPropertiesFrom(issueProps) {
  const {
    title, url, number, body, created, updated, labels, assignees, statusName
  } = issueProps;

  const props = {};

  props[P.TITLE] = { title: [{ text: { content: title } }] };
  props[P.STATUS] = { select: { name: statusName } };
  props[P.URL] = { url: url };
  if (number !== null) props[P.NUMBER] = { number: number };
  props[P.LABELS] = { rich_text: [{ text: { content: labels } }] };
  props[P.ASSIGNEE] = { rich_text: [{ text: { content: assignees } }] };
  props[P.DESCRIPTION] = { rich_text: [{ text: { content: body } }] };
  if (created) props[P.CREATED] = { date: { start: created } };
  if (updated) props[P.UPDATED] = { date: { start: updated } };

  return props;
}

async function createNotionPage(props) {
  try {
    await notion.pages.create({
      parent: { database_id: DATABASE_ID },
      properties: props
    });
    console.log(`${LOG_PREFIX} Página creada en Notion: ${props[P.TITLE].title[0].text.content}`);
  } catch (err) {
    console.error(`${LOG_PREFIX} Error creando página:`, err.body || err);
    throw err;
  }
}

async function updateNotionPage(pageId, props) {
  try {
    await notion.pages.update({
      page_id: pageId,
      properties: props
    });
    console.log(`${LOG_PREFIX} Página actualizada en Notion (pageId=${pageId})`);
  } catch (err) {
    console.error(`${LOG_PREFIX} Error actualizando página:`, err.body || err);
    throw err;
  }
}

async function main() {
  try {
    const event = readEvent();
    const action = event.action;
    const issue = event.issue;

    if (!issue) {
      console.log(`${LOG_PREFIX} Evento no contiene issue, saliendo.`);
      return;
    }

    const issueProps = issueToProps(issue);
    const notionProps = buildNotionPropertiesFrom(issueProps);

    const existing = await queryPageByUrl(issueProps.url);

    if (action === "opened" && !existing) {
      await createNotionPage(notionProps);
      return;
    }

    if (existing) {
      const pageId = existing.id;
      if (action === "closed") {
        notionProps[P.STATUS] = { select: { name: "Terminado" } };
      }
      if (action === "reopened") {
        notionProps[P.STATUS] = { select: { name: "Pendiente" } };
      }
      await updateNotionPage(pageId, notionProps);
      return;
    }

    if (!existing) {
      await createNotionPage(notionProps);
    }
  } catch (err) {
    console.error(`${LOG_PREFIX} Error en main:`, err.body || err);
    process.exit(1);
  }
}

main();
