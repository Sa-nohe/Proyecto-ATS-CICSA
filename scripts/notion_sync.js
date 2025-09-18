

const { Client } = require("@notionhq/client");
const { Octokit } = require("@octokit/rest");

// ==========================
// 🔑 Configuración
// ==========================

// Token de Notion (se guarda en GitHub Secret: NOTION_TOKEN)
const notion = new Client({ auth: process.env.NOTION_TOKEN });

// Database ID de tu base en Notion
const DATABASE_ID = "7a01a392eb3049e68ae191b93c8881de";

// Token de GitHub (se guarda en GitHub Secret: GITHUB_TOKEN)
const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

// Owner y repo (ajusta a tu repositorio)
const OWNER = "Sa-nohe"; // 🔁 reemplaza por tu usuario/org de GitHub
const REPO = "Proyecto-ATS-CICSA"; // 🔁 reemplaza por el nombre del repo

// ==========================
// 🚀 Función principal
// ==========================
async function syncIssues() {
  try {
    console.log("[sync] Leyendo issues de GitHub...");

    // Traer los issues abiertos
    const { data: issues } = await octokit.issues.listForRepo({
      owner: OWNER,
      repo: REPO,
      state: "open",
    });

    console.log(`[sync] ${issues.length} issues encontrados.`);

    for (const issue of issues) {
      console.log(`[sync] Insertando issue #${issue.number} en Notion...`);

      await notion.pages.create({
        parent: { database_id: DATABASE_ID },
        properties: {
          Title: {
            title: [
              {
                text: {
                  content: issue.title,
                },
              },
            ],
          },
          URL: {
            url: issue.html_url,
          },
          Estado: {
            select: { name: issue.state === "open" ? "Abierto" : "Cerrado" },
          },
        },
      });
    }

    console.log("[sync] ✅ Sincronización terminada con éxito.");
  } catch (error) {
    console.error("[sync] ❌ Error:", error);
    process.exit(1);
  }
}

syncIssues();

