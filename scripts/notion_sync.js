const fs = require("fs");
const { Client } = require("@notionhq/client");

const NOTION_TOKEN = process.env.NOTION_TOKEN;
const DATABASE_ID = "7a01a392eb3049e68ae191b93c8881de";
const GITHUB_EVENT_PATH = process.env.GITHUB_EVENT_PATH;
const LOG_PREFIX = "[notion-sync]";

if (!NOTION_TOKEN || !DATABASE_ID) {
  console.error(`${LOG_PREFIX} Faltan NOTION_TOKEN o NOTION_DATABASE_ID.`);
  process.exit(1);
}

const notion = new Client({ auth: NOTION_TOKEN });

function readEvent() {
  if (GITHUB_EVENT_PATH && fs.existsSync(GITHUB_EVENT_PATH)) {
    const raw = fs.readFileSync(GITHUB_EVENT_PATH, "utf8");
    return JSON.parse(raw);
  }
  throw new Error("No se encontró el payload del evento de GitHub.");
}

function issueToProps(issue) {
  const title = issue.title || "";
  const url = issue.html_url || "";
  const number = issue.number || null;
  const body = issue.body || "";
  const statusName = issue.state === "open" ? "Pendiente" : "Terminado";

  return {
    title,
    url,
    number,
    body,
    statusName
  };
}

function buildNotionProps(props) {
  return {
    Nombre: { title: [{ text: { content: props.title } }] },
    Estado: { select: { name: props.statusName } },
    "GitHub URL": { url: props.url },
    "Issue Number": { number: props.number },
    Descripción: { rich_text: [{ text: { content: props.body } }] }
  };
}

async function main() {
  try {
    const event = readEvent();
    const issue = event.issue;
    if (!issue) {
      console.log(`${LOG_PREFIX} No es un evento de issue.`);
      return;
    }
    const props = buildNotionProps(issueToProps(issue));
    await notion.pages.create({
      parent: { database_id: DATABASE_ID },
      properties: props
    });
    console.log(`${LOG_PREFIX} Issue sincronizado con Notion: ${issue.title}`);
  } catch (err) {
    console.error(`${LOG_PREFIX} Error:`, err.body || err.message || err);
    process.exit(1);
  }
}

main();
