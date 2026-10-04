// Cloudflare Worker that starts the Upptime workflows on a fixed timetable.
//
// GitHub's own cron fires the 5-minute uptime check for this repo only every
// few hours, so the checks are driven from here instead. The workflows keep
// their GitHub schedules as a fallback. Checks still run on GitHub's runners,
// so this only replaces the clock, not the vantage point.
//
// Cron trigger (set on the Worker): "*/5 * * * *". The timetable lives in
// workflowsFor() below, so changing it never needs a dashboard edit.
// Secret: GITHUB_TOKEN, a fine-grained token with Actions read-write on REPO.

const REPO = "theperseuslabs/wheelstrat-status";
const REF = "master";

// All Upptime workflows share one concurrency group: one run executes, one
// waits, and a third started in the same window gets cancelled. So a tick
// never starts more than two, and the two extra jobs sit on different ticks.
function workflowsFor(minute) {
  if (minute % 5 !== 0) return [];
  const workflows = ["uptime.yml"];
  // Response Time CI is what moves the page's "last updated" time and feeds
  // the graphs; Summary CI refreshes the averages the front page reads.
  if (minute % 30 === 10) workflows.push("response-time.yml");
  if (minute % 30 === 20) workflows.push("summary.yml");
  return workflows;
}

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
    // The first version of this Worker also had a 30-minute trigger. If it is
    // still configured, ignore it so those ticks don't start everything twice.
    if (event.cron === "*/30 * * * *") return;
    const minute = new Date(event.scheduledTime).getUTCMinutes();
    ctx.waitUntil(Promise.all(workflowsFor(minute).map((w) => dispatch(w, env.GITHUB_TOKEN))));
  },
};
