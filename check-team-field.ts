import { getJiraClient } from "./src/services/jira-client";

async function main() {
  const client = getJiraClient();

  // Buscar issue EP com filtro "Monte Bravo Teams" = "Squad LifeCycle"
  const resp = await client.post<any>("/rest/api/3/search/jql", {
    jql: 'project = EP AND fixVersion = "R2 - COMPLIANCE, ONBOARDING E FEE-BASED" AND "Monte Bravo Teams" = "Squad LifeCycle"',
    fields: ["summary", "customfield_10783", "customfield_10546", "customfield_10087"],
    maxResults: 3,
  });

  console.log("Total issues LifeCycle em R2 EP:", resp.total);

  for (const issue of resp.issues) {
    console.log("\n---", issue.key, "---");
    console.log("customfield_10783:", JSON.stringify(issue.fields.customfield_10783));
    console.log("customfield_10546:", JSON.stringify(issue.fields.customfield_10546));
    console.log("customfield_10087:", JSON.stringify(issue.fields.customfield_10087));
  }

  // Agora buscar com *all para uma única issue e ver o campo correto
  console.log("\n\n=== ALL CUSTOM FIELDS for first issue ===");
  if (resp.issues.length > 0) {
    const allResp = await client.post<any>("/rest/api/3/search/jql", {
      jql: `key = ${resp.issues[0].key}`,
      fields: ["*all"],
      maxResults: 1,
    });
    const issue = allResp.issues[0];
    const customs = Object.entries(issue.fields)
      .filter(([k, v]) => k.startsWith("custom") && v !== null)
      .map(([k, v]) => [k, JSON.stringify(v).slice(0, 200)]);

    for (const [k, v] of customs) {
      if ((v as string).toLowerCase().includes("lifecycle") || (v as string).toLowerCase().includes("squad")) {
        console.log("***", k, ":", v);
      }
    }
  }
}

main().catch(console.error);
