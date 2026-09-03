import fs from 'node:fs';

const username = process.env.USERNAME || 'ikhwanHariyanto';
const token = process.env.GITHUB_TOKEN;
const templatePath = process.env.TEMPLATE_PATH || 'contributor-animate.svg';
const outputPath = process.env.OUTPUT_PATH || 'profile/contributor-animate.svg';

if (!token) throw new Error('GITHUB_TOKEN is required');

const endDate = new Date();
const startDate = new Date(endDate);
startDate.setDate(startDate.getDate() - 364);
const query = `query ($username: String!, $from: DateTime!, $to: DateTime!) {
  user(login: $username) {
    contributionsCollection(from: $from, to: $to) {
      contributionCalendar { totalContributions weeks { contributionDays { contributionCount contributionLevel date } } }
      totalCommitContributions totalIssueContributions totalPullRequestContributions totalPullRequestReviewContributions
    }
  }
}`;

const response = await fetch('https://api.github.com/graphql', {
  method: 'POST',
  headers: { Accept: 'application/vnd.github+json', Authorization: `bearer ${token}`, 'Content-Type': 'application/json', 'User-Agent': 'gundam-contribution-updater' },
  body: JSON.stringify({ query, variables: { username, from: startDate.toISOString(), to: endDate.toISOString() } }),
});
if (!response.ok) throw new Error(`GitHub API returned ${response.status}`);
const payload = await response.json();
if (payload.errors?.length || !payload.data?.user) throw new Error(payload.errors?.map((error) => error.message).join('; ') || `User ${username} not found`);

const collection = payload.data.user.contributionsCollection;
const calendar = collection.contributionCalendar;
const days = calendar.weeks.flatMap((week) => week.contributionDays);
const levelFor = (day) => ({ NONE: 0, FIRST_QUARTILE: 1, SECOND_QUARTILE: 2, THIRD_QUARTILE: 3, FOURTH_QUARTILE: 4 }[day?.contributionLevel] ?? 0);
const escapeXml = (value) => String(value).replace(/[<>&'"]/g, (character) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[character]));

// Keep the original SVG as the visual template; only data tokens are replaced.
let svg = fs.readFileSync(templatePath, 'utf8');
const cellPattern = /(<g transform="translate\([0-9.]+ [0-9.]+\)">.*?<\/g>)/gs;
const cells = [...svg.matchAll(cellPattern)];
if (!cells.length) throw new Error('No contribution cells found in the template');
const templateDays = days.slice(0, cells.length);
let cellIndex = 0;
svg = svg.replace(cellPattern, (cell) => {
  const index = cellIndex++;
  if (index >= templateDays.length) return cell;
  const day = templateDays[index];
  if (!day) return cell;
  const level = levelFor(day);
  return cell.replace(/(cont-(?:top|left|right)-p\d+-)\d+/g, `$1${level}`)
    .replace(/<title>[^<]*<\/title>/g, `<title>${escapeXml(day.date)}: ${day.contributionCount} contributions</title>`);
});

const replaceTextAt = (x, value, title = null) => {
  const pattern = new RegExp(`(<text[^>]*x="${x}"[^>]*>).*?(<\\/text>)`);
  svg = svg.replace(pattern, `$1${value}${title === null ? '' : `<title>${title}</title>`}$2`);
};
replaceTextAt('384', calendar.totalContributions);
replaceTextAt('650', collection.totalCommitContributions, collection.totalCommitContributions);
replaceTextAt('772', collection.totalPullRequestContributions, collection.totalPullRequestContributions);
svg = svg.replace(/202[0-9]-[0-9]{2}-[0-9]{2} \/ 202[0-9]-[0-9]{2}-[0-9]{2}/, `${startDate.toISOString().slice(0, 10)} / ${endDate.toISOString().slice(0, 10)}`);

fs.mkdirSync(outputPath.split('/').slice(0, -1).join('/') || '.', { recursive: true });
fs.writeFileSync(outputPath, svg);
console.log(`Updated ${outputPath} for ${username}: ${calendar.totalContributions} contributions`);
