const CLOUD_ID = process.env.JIRA_CLOUD_ID;
const JIRA_TOKEN = process.env.JIRA_API_TOKEN;
const JIRA_EMAIL = process.env.JIRA_EMAIL;

const BASE = `https://api.atlassian.com/ex/jira/${CLOUD_ID}/rest/api/3`;

const OPEN_JQL = 'filter = "BH Bug Reporting - Open Bugs Related to BH" ORDER BY priority DESC';
const RESOLVED_JQL = 'filter = "BH Bug Reporting - Resolved Bugs Related to BH" ORDER BY updated DESC';

async function fetchAllIssues(jql) {
  const auth = Buffer.from(`${JIRA_EMAIL}:${JIRA_TOKEN}`).toString('base64');
  let allIssues = [];
  let startAt = 0;
  const maxResults = 50;

  while (true) {
    const params = new URLSearchParams({
      jql,
      maxResults,
      startAt,
      fields: 'summary,status,priority,parent,customfield_10014',
    });

    const res = await fetch(`${BASE}/search/jql?${params}`, {
      headers: {
        Authorization: `Basic ${auth}`,
        Accept: 'application/json',
      },
    });

    const text = await res.text();
    if (!res.ok) throw new Error(`Jira ${res.status}: ${text}`);

    const data = JSON.parse(text);
    const issues = data.issues || [];
    allIssues = allIssues.concat(issues);

    // Stop if we got fewer than maxResults (last page)
    if (issues.length < maxResults) break;
    startAt += maxResults;

    // Safety cap at 200 issues
    if (allIssues.length >= 200) break;
  }

  return allIssues;
}

function countPriorities(issues) {
  let high = 0, medium = 0, low = 0;
  issues.forEach((i) => {
    const p = (i.fields.priority?.name || '').toLowerCase();
    if (p === 'high' || p === 'highest') high++;
    else if (p === 'medium') medium++;
    else if (p === 'low' || p === 'lowest') low++;
  });
  return { high, medium, low };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=60');

  if (!CLOUD_ID || !JIRA_TOKEN || !JIRA_EMAIL) {
    return res.status(500).json({
      error: 'Missing env vars',
      missing: {
        JIRA_CLOUD_ID: !CLOUD_ID,
        JIRA_API_TOKEN: !JIRA_TOKEN,
        JIRA_EMAIL: !JIRA_EMAIL,
      },
    });
  }

  try {
    const [openIssues, resolvedIssues] = await Promise.all([
      fetchAllIssues(OPEN_JQL),
      fetchAllIssues(RESOLVED_JQL),
    ]);

    const openP = countPriorities(openIssues);
    const resolvedP = countPriorities(resolvedIssues);

    return res.status(200).json({
      fetchedAt: new Date().toISOString(),
      open: {
        total: openIssues.length,
        high: openP.high,
        medium: openP.medium,
        low: openP.low,
        issues: openIssues,
      },
      resolved: {
        total: resolvedIssues.length,
        high: resolvedP.high,
        medium: resolvedP.medium,
        low: resolvedP.low,
        issues: resolvedIssues,
      },
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
