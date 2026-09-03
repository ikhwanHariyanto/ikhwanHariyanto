import fs from 'node:fs';

const username = process.env.USERNAME || 'ikhwanHariyanto';
const token = process.env.GITHUB_TOKEN;
const templatePath = process.env.TEMPLATE_PATH || 'contributor-animate.svg';
const outputPath = process.env.OUTPUT_PATH || 'profile/contributor-animate.svg';

if (!token) throw new Error('GITHUB_TOKEN is required');

const endDate = new Date();
const startDate = new Date(endDate);
startDate.setDate(startDate.getDate() - 364);
startDate.setDate(startDate.getDate() - startDate.getDay());
const query = `query ($username: String!, $from: DateTime!, $to: DateTime!) {
  user(login: $username) {
    repositories(first: 100, ownerAffiliations: OWNER, isFork: false) {
      nodes { stargazerCount forkCount }
    }
    contributionsCollection(from: $from, to: $to) {
      contributionCalendar { totalContributions weeks { contributionDays { contributionCount contributionLevel date } } }
      totalCommitContributions totalIssueContributions totalPullRequestContributions totalPullRequestReviewContributions totalRepositoryContributions
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
const repositories = payload.data.user.repositories.nodes;
const totalStars = repositories.reduce((total, repository) => total + repository.stargazerCount, 0);
const totalForks = repositories.reduce((total, repository) => total + repository.forkCount, 0);
const calendar = collection.contributionCalendar;
const days = calendar.weeks.flatMap((week) => week.contributionDays);
const levelFor = (day) => ({ NONE: 0, FIRST_QUARTILE: 1, SECOND_QUARTILE: 2, THIRD_QUARTILE: 3, FOURTH_QUARTILE: 4 }[day.contributionLevel] ?? 0);
const escapeXml = (value) => String(value).replace(/[<>&'"]/g, (character) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[character]));

// Keep the original SVG as the visual template; only data tokens are replaced.
let svg = fs.readFileSync(templatePath, 'utf8');
svg = svg
  .replace(/\.cont-top-p0-0 \{ fill: #313c45; \}/g, '.cont-top-p0-0 { fill: #5f7788; }')
  .replace(/\.cont-left-p0-0 \{ fill: #4f6271; \}/g, '.cont-left-p0-0 { fill: #7893a3; }')
  .replace(/\.cont-right-p0-0 \{ fill: #4f6271; \}/g, '.cont-right-p0-0 { fill: #7893a3; }');
const cellPattern = /(<g transform="translate\([0-9.]+ [0-9.]+\)">.*?<\/g>)/gs;
const cells = [...svg.matchAll(cellPattern)];
if (!cells.length) throw new Error('No contribution cells found in the template');
const templateDays = days.slice(0, cells.length);
let cellIndex = 0;
svg = svg.replace(cellPattern, (cell) => {
  const index = cellIndex++;
  if (index >= templateDays.length) return cell;
  const day = templateDays[index];
  const level = levelFor(day);
  const outer = cell.match(/^<g transform="translate\(([0-9.]+) ([0-9.]+)\)">/);
  const side = cell.match(/<rect[^>]+height="([0-9.]+)"[^>]+class="cont-left-/);
  const scale = Math.sqrt(18 ** 2 + 10.39 ** 2) / 18;
  const contributionHeight = Math.log10(day.contributionCount / 20 + 1) * 144 + 3;
  const baseline = outer && side ? Number(outer[2]) + Number(side[1]) * scale : null;
  const nextY = baseline === null ? null : baseline - contributionHeight;
  return cell
    .replace(/(cont-(?:top|left|right)-p\d+-)\d+/g, `$1${level}`)
    .replace(/^<g transform="translate\(([0-9.]+) ([0-9.]+)\)">/, nextY === null ? '$&' : `<g transform="translate($1 ${nextY.toFixed(2)})">`)
    .replace(/(<rect[^>]+height=")[0-9.]+("[^>]+class="cont-left-)/, `$1${(contributionHeight / scale).toFixed(2)}$2`)
    .replace(/(<rect[^>]+height=")[0-9.]+("[^>]+class="cont-right-)/, `$1${(contributionHeight / scale).toFixed(2)}$2`)
    .replace(/values="[0-9.]+;[0-9.]+"/g, `values="2.6;${(contributionHeight / scale).toFixed(2)}"`)
    .replace(/values="[0-9.]+ [0-9.]+;[0-9.]+ [0-9.]+"/, outer && nextY !== null ? `values="${outer[1]} ${baseline.toFixed(2)};${outer[1]} ${nextY.toFixed(2)}"` : '$&')
    .replace(/<title>[^<]*<\/title>/g, `<title>${escapeXml(day.date)}: ${day.contributionCount} contributions</title>`);
});

const donutStart = svg.indexOf('<g transform="translate(40, 504)">');
const donutEnd = svg.indexOf('</g></g><g><text', donutStart);
if (donutStart >= 0 && donutEnd > donutStart) {
  const donut = svg.slice(donutStart, donutEnd);
  const brighterDonut = donut
    .replace('fill="#4f6271"', 'fill="#65b8ad"')
    .replace('fill="#4f6271"', 'fill="#8aa9b4"')
    .replace('fill: #4f6271;', 'fill: #65b8ad;')
    .replace('fill: #4f6271;', 'fill: #8aa9b4;');
  svg = `${svg.slice(0, donutStart)}${brighterDonut}${svg.slice(donutEnd)}`;
}

const radarValues = [
  collection.totalCommitContributions,
  collection.totalIssueContributions,
  collection.totalPullRequestContributions,
  collection.totalPullRequestReviewContributions,
  collection.totalRepositoryContributions,
];
const radarPoints = radarValues.map((value, index) => {
  const radius = Math.min(156, Math.log10(value + 1) / 4 * 156);
  const angle = (-90 + index * 72) * (Math.PI / 180);
  return `${(Math.cos(angle) * radius).toFixed(2)},${(Math.sin(angle) * radius).toFixed(2)}`;
}).join(' ');
svg = svg.replace(/(<polygon class="radar" points=")[^"]+/, `$1${radarPoints}`);
const radarLabels = ['Commit', 'Issue', 'PullReq', 'Review', 'Repo'];
radarLabels.forEach((label, index) => {
  svg = svg.replace(new RegExp(`>${label}<title>\\d+</title>`), `>${label}<title>${radarValues[index]}</title>`);
});

const replaceTextAt = (x, value, title = null) => {
  const pattern = new RegExp(`(<text[^>]*x="${x}"[^>]*>).*?(<\\/text>)`);
  svg = svg.replace(pattern, `$1${value}${title === null ? '' : `<title>${title}</title>`}$2`);
};
replaceTextAt('384', calendar.totalContributions);
replaceTextAt('650', totalStars, totalStars);
replaceTextAt('772', totalForks, totalForks);
svg = svg.replace(/202[0-9]-[0-9]{2}-[0-9]{2} \/ 202[0-9]-[0-9]{2}-[0-9]{2}/, `${startDate.toISOString().slice(0, 10)} / ${endDate.toISOString().slice(0, 10)}`);

fs.mkdirSync(outputPath.split('/').slice(0, -1).join('/') || '.', { recursive: true });
fs.writeFileSync(outputPath, svg);
console.log(`Updated ${outputPath} for ${username}: ${calendar.totalContributions} contributions`);
