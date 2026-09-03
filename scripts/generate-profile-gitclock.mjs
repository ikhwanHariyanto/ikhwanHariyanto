import fs from 'node:fs';

const username = process.env.USERNAME || 'ikhwanHariyanto';
const token = process.env.GITHUB_TOKEN;
const outputPath = process.env.OUTPUT_PATH || 'profile/profile-gitclock.svg';

if (!token) {
  throw new Error('GITHUB_TOKEN is required');
}

const endDate = new Date();
const startDate = new Date(endDate);
startDate.setDate(startDate.getDate() - 364);

const query = `
  query ($username: String!, $from: DateTime!, $to: DateTime!) {
    user(login: $username) {
      contributionsCollection(from: $from, to: $to) {
        contributionCalendar {
          totalContributions
          weeks {
            contributionDays { contributionCount contributionLevel date }
          }
        }
        totalCommitContributions
        totalIssueContributions
        totalPullRequestContributions
        totalPullRequestReviewContributions
      }
    }
  }
`;

const response = await fetch('https://api.github.com/graphql', {
  method: 'POST',
  headers: {
    Accept: 'application/vnd.github+json',
    Authorization: `bearer ${token}`,
    'Content-Type': 'application/json',
    'User-Agent': 'profile-gitclock-generator',
  },
  body: JSON.stringify({
    query,
    variables: {
      username,
      from: startDate.toISOString(),
      to: endDate.toISOString(),
    },
  }),
});

if (!response.ok) {
  throw new Error(`GitHub API returned ${response.status}`);
}

const payload = await response.json();
if (payload.errors?.length || !payload.data?.user) {
  throw new Error(payload.errors?.map((error) => error.message).join('; ') || `User ${username} not found`);
}

const collection = payload.data.user.contributionsCollection;
const calendar = collection.contributionCalendar;
const days = calendar.weeks.flatMap((week) => week.contributionDays);
const levelColors = {
  NONE: '#17242d',
  FIRST_QUARTILE: '#315565',
  SECOND_QUARTILE: '#3f8392',
  THIRD_QUARTILE: '#65b8ad',
  FOURTH_QUARTILE: '#d9f36a',
};

const escapeXml = (value) => String(value).replace(/[<>&'"]/g, (character) => ({
  '<': '&lt;',
  '>': '&gt;',
  '&': '&amp;',
  "'": '&apos;',
  '"': '&quot;',
}[character]));

const cells = days.map((day, index) => {
  const column = Math.floor(index / 7);
  const row = index % 7;
  const x = 74 + column * 18;
  const y = 218 + row * 18;
  const color = levelColors[day.contributionLevel] || levelColors.NONE;
  return `<rect x="${x}" y="${y}" width="14" height="14" rx="2" fill="${color}"><title>${escapeXml(day.date)}: ${day.contributionCount} contributions</title></rect>`;
}).join('');

const stat = (x, label, value, accent) => `<g><text x="${x}" y="535" class="label">${label}</text><text x="${x}" y="578" class="value" fill="${accent}">${value}</text></g>`;
const updated = endDate.toISOString().slice(0, 10);
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720" role="img" aria-labelledby="title desc">
  <title id="title">${escapeXml(username)} GitHub contribution clock</title>
  <desc id="desc">A Gundam-inspired contribution calendar updated from GitHub.</desc>
  <style>
    * { font-family: Ubuntu, Helvetica, Arial, sans-serif; }
    .label { fill: #8aa9b4; font-size: 14px; letter-spacing: 2px; }
    .value { font-size: 34px; font-weight: 700; }
    .small { fill: #8aa9b4; font-size: 13px; letter-spacing: 1px; }
    .heading { fill: #e8f5f2; font-size: 26px; font-weight: 700; letter-spacing: 3px; }
  </style>
  <rect width="1280" height="720" fill="#0b1218"/>
  <path d="M28 28H1252V692H28Z" fill="#111d25" stroke="#65b8ad" stroke-opacity=".55" stroke-width="2"/>
  <path d="M28 92H1252M28 636H1252" stroke="#315565" stroke-width="2"/>
  <path d="M52 58H430M850 58H1228" stroke="#d9f36a" stroke-width="2"/>
  <text x="52" y="72" class="heading">MOBILE SUIT // GITCLOCK</text>
  <text x="1228" y="70" text-anchor="end" class="small">PILOT: ${escapeXml(username.toUpperCase())}</text>
  <text x="52" y="132" class="label">CONTRIBUTION ACTIVITY // LAST 365 DAYS</text>
  <text x="1228" y="132" text-anchor="end" class="small">SYNC ${updated} // SYSTEM ONLINE</text>
  <rect x="52" y="158" width="1000" height="350" rx="4" fill="#0d171e" stroke="#315565"/>
  <path d="M52 186H1052M52 480H1052" stroke="#203944"/>
  <text x="74" y="178" class="small">LOW</text><text x="1018" y="178" text-anchor="end" class="small">HIGH</text>
  ${cells}
  <g transform="translate(74 466)"><rect width="14" height="14" rx="2" fill="#17242d"/><rect x="20" width="14" height="14" rx="2" fill="#315565"/><rect x="40" width="14" height="14" rx="2" fill="#3f8392"/><rect x="60" width="14" height="14" rx="2" fill="#65b8ad"/><rect x="80" width="14" height="14" rx="2" fill="#d9f36a"/></g>
  <text x="168" y="478" class="small">ACTIVITY DENSITY</text>
  <rect x="1080" y="158" width="144" height="350" rx="4" fill="#16252d" stroke="#65b8ad" stroke-opacity=".6"/>
  <path d="M1094 186H1210M1094 470H1210" stroke="#315565"/>
  <text x="1100" y="218" class="small">SYNC</text><text x="1100" y="258" class="value" fill="#d9f36a">OK</text>
  <path d="M1100 300L1130 270L1160 300L1190 270L1208 300" fill="none" stroke="#65b8ad" stroke-width="3"/>
  <text x="1100" y="440" class="small">RANK</text><text x="1100" y="478" class="value" fill="#65b8ad">LIVE</text>
  ${stat(72, 'TOTAL', calendar.totalContributions, '#d9f36a')}
  ${stat(330, 'COMMITS', collection.totalCommitContributions, '#65b8ad')}
  ${stat(588, 'ISSUES', collection.totalIssueContributions, '#65b8ad')}
  ${stat(846, 'PULL REQUESTS', collection.totalPullRequestContributions, '#65b8ad')}
  <text x="1228" y="578" text-anchor="end" class="small">REVIEWS ${collection.totalPullRequestReviewContributions}</text>
  <text x="52" y="670" class="small">GUNDAM-STYLE CONTRIBUTION SYSTEM / DATA LINK ESTABLISHED</text>
  <text x="1228" y="670" text-anchor="end" class="small">GITHUB.COM/${escapeXml(username.toUpperCase())}</text>
</svg>`;

fs.mkdirSync(outputPath.split('/').slice(0, -1).join('/') || '.', { recursive: true });
fs.writeFileSync(outputPath, svg);
console.log(`Generated ${outputPath} for ${username}: ${calendar.totalContributions} contributions`);
