const CLOUD_ID = process.env.JIRA_CLOUD_ID;
const JIRA_TOKEN = process.env.JIRA_API_TOKEN;
const JIRA_EMAIL = process.env.JIRA_EMAIL;

const BASE = `https://api.atlassian.com/ex/jira/${CLOUD_ID}/rest/api/3`;

const OPEN_JQL = 'filter = "BH Bug Reporting - Open Bugs Related to BH" ORDER BY priority DESC';
const RESOLVED_JQL = 'filter = "BH Bug Reporting - Resolved Bugs Related to BH" ORDER BY updated DESC';

async function fetchIssues(jql, maxResults = 50) {
  const params = new URLSearchParams({
    jql,
    maxResults,
    fields: 'summary,status,priority,parent,customfield_10014',
  });

  const url = `${BASE}/search/jql?${params}`;
  const auth = Buffer.from(`${JIRA_EMAIL}:${JIRA_TOKEN}`).toString('base64');

  const res = await fetch(url, {
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: 'application/json',
    },
  });

  const text = await res.text();

  if (!res.ok) {
    throw new Error(`Jira ${res.status}: ${text}`);
  }

  return JSON.parse(text);
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
    const [openData, resolvedData] = await Promise.all([
      fetchIssues(OPEN_JQL),
      fetchIssues(RESOLVED_JQL),
    ]);

    const allIssues = [...(openData.issues || []), ...(resolvedData.issues || [])];
    let high = 0, medium = 0, low = 0;

    allIssues.forEach((i) => {
      const p = (i.fields.priority?.name || '').toLowerCase();
      if (p === 'high' || p === 'highest') high++;
      else if (p === 'medium') medium++;
      else if (p === 'low' || p === 'lowest') low++;
    });

    return res.status(200).json({
      fetchedAt: new Date().toISOString(),
      metrics: { total: (openData.total || 0) + (resolvedData.total || 0), high, medium, low },
      open: { total: openData.total || 0, issues: openData.issues || [] },
      resolved: { total: resolvedData.total || 0, issues: resolvedData.issues || [] },
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
