// Cloudflare Worker that starts the Upptime workflows on a fixed timetable.
//
// GitHub's own cron did not fire the 5-minute uptime check for this repo, so
// the checks are driven from here instead. The workflows keep their GitHub
// schedules as a fallback. Checks still run on GitHub's runners, so this only
// replaces the clock, not the vantage point.
//
// Cron triggers (set on the Worker): "*/5 * * * *" and "*/30 * * * *".
// Secret: GITHUB_TOKEN, a fine-grained token with Actions read-write on REPO.

const REPO = "theperseuslabs/wheelstrat-status";
const REF = "master";

const WORKFLOWS_BY_CRON = {
  "*/5 * * * *": ["uptime.yml"],
  // Response Time CI is what moves the page's "last updated" time and feeds
  // the graphs; Summary CI refreshes the averages the front page reads.
  "*/30 * * * *": ["response-time.yml", "summary.yml"],
};

async function dispatch(workflow, token) {
  const res = await fetch(
    `https://api.github.com/repos/${REPO}/actions/workflows/${workflow}/dispatches`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "wheelstrat-status-trigger",
      },
      body: JSON.stringify({ ref: REF }),
    }
  );
  if (!res.ok) {
    throw new Error(`${workflow}: GitHub answered ${res.status} ${await res.text()}`);
  }
}

export default {
  async scheduled(event, env, ctx) {
    const workflows = WORKFLOWS_BY_CRON[event.cron] ?? [];
    ctx.waitUntil(Promise.all(workflows.map((w) => dispatch(w, env.GITHUB_TOKEN))));
  },
};
