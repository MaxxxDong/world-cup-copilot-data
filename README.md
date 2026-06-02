# World Cup Copilot Data

这个目录是独立的世界杯数据包生成仓库。已发布的数据包在
[`MaxxxDong/world-cup-copilot-data`](https://github.com/MaxxxDong/world-cup-copilot-data)，插件仓库只消费它发布出的 `manifest.json` 和数据文件。

当前默认发布入口：

```text
https://raw.githubusercontent.com/MaxxxDong/world-cup-copilot-data/main/manifest.json
```

当前版本是 Phase A 数据包生成器：可以用小型 demo seed 验证结构，也可以读取公开 raw source 生成真实来源归因的数据包。它已经覆盖 2026 赛程结构、比赛识别索引、国家队历史结果、历史队名、点球大战、进球者记录、head-to-head World Cup / competitive / neutral splits、team profiles、historical key-player profiles、current key-player candidate profiles 和 Polymarket 搜索 query seeds。官方 final roster 尚未进入包时，可以用 `--simulate-squads` 生成明确标注的模拟名单与当前核心球员画像；官方名单发布后再用 `--fifa-squads-json` 替换。

## 目录

```text
input/                 Phase A demo 输入 seed
input/raw/             本地 raw source 缓存，已 gitignore
scripts/               数据生成和校验脚本
schemas/               数据结构 schema 草案
test/                  Node 内置测试
dist/phase-a-demo/     生成后的 demo 数据包内容
dist/phase-a-real/     本地真实数据包输出，已 gitignore
```

## 命令

```powershell
npm test
npm run generate
npm run validate
npm run audit:completion
npm run audit:package-budget
npm run audit:readiness
npm run audit:source-inputs
npm run audit:fifa-squads-input -- --allow-missing
npm run audit:release
npm run audit:remote-latency
npm run audit:fifa-schedule
```

`npm run generate` 会从 `input/phase-a-seed.json` 生成 `dist/phase-a-demo/`：

- `data/sources/sources.json`
- `data/metadata/coverage.json`
- `data/metadata/identity-gaps.json`
- `data/metadata/layer-index.json`
- `data/metadata/source-inputs.json`
- `data/metadata/source-audit.json`
- `data/identification/matches.json`
- `data/taxonomy/teams.json`
- `data/taxonomy/team-aliases.json`
- `data/taxonomy/team-quality.json`
- `data/taxonomy/venues.json`
- `data/market-mapping/polymarket-query-seeds.json`
- `data/schedule/worldcup-2026.json`
- `data/history/international-results-index.json`
- `data/history/head-to-head/*.json`
- `data/history/form/*.json`
- `data/profiles/teams/*.json`
- `data/profiles/key-players/historical/{teamId}/*.json`
- `data/profiles/key-players/current/{teamId}/*.json`（仅在导入 roster 输入后生成）
- `checksums/sha256.txt`
- `manifest.json`

也可以传入真实原始文件生成 normalized snapshot：

```powershell
node scripts/generate-phase-a.mjs `
  --out dist/phase-a-real `
  --openfootball-json path\to\worldcup.json `
  --international-results-csv path\to\results.csv `
  --former-names-csv path\to\former_names.csv `
  --shootouts-csv path\to\shootouts.csv `
  --goalscorers-csv path\to\goalscorers.csv `
  --reep-teams-csv path\to\reep\data\teams.csv `
  --reep-people-csv path\to\reep\data\people.csv `
  --wikidata-teams-csv path\to\wikidata-national-football-teams.csv `
  --fifa-squads-json path\to\fifa-squads.json `
  --simulate-squads `
  --team-registry input\team-registry.seed.json `
  --venue-registry input\venue-registry.seed.json `
  --data-version 2026.05.26+001 `
  --generated-at 2026-05-26T12:00:00.000Z `
  --git-commit <data-source-commit>
```

`--simulate-squads` 只在没有 `--fifa-squads-json` 输入时生效。它会基于已确定的 48 支参赛队和历史国家队进球记录，为每队生成 8 名 current key-player candidate，所有 roster/profile 都写入 `rosterStatus=simulated` 和 `profileStatus=available-simulated`。插件和 agent 必须把这些内容说成“模拟/占位名单”，不能当作 FIFA 官方名单事实。

本仓库也带有 raw fixture，可用于验证真实导入路径：

```powershell
node scripts/generate-phase-a.mjs `
  --out dist/phase-a-raw-fixture `
  --openfootball-json test\fixtures\openfootball-worldcup.sample.json `
  --international-results-csv test\fixtures\international-results.sample.csv `
  --former-names-csv test\fixtures\former-names.sample.csv `
  --shootouts-csv test\fixtures\shootouts.sample.csv `
  --goalscorers-csv test\fixtures\goalscorers.sample.csv `
  --team-registry input\team-registry.seed.json `
  --generated-at 2026-05-26T12:00:00.000Z `
  --git-commit fixture
```

## 真实数据包验证快照

2026-05-27 已用本地下载的公开 raw source 跑通一次完整 Phase A 生成与校验：

```powershell
node scripts/generate-phase-a.mjs --out dist/phase-a-real ...
node scripts/validate-package.mjs dist\phase-a-real
npm run audit:source-inputs -- --package dist/phase-a-real
```

`validate-package` 会校验 manifest hash/size、JSON 可解析性、`sourceRefs` 完整性，以及 `data/taxonomy/teams.json` 与 `data/taxonomy/team-quality.json` 的语义一致性。`data/metadata/coverage.json` 是 core required 文件，用机器可读方式说明 schedule、history、goalscorer、player identities、official rosters、team profiles、key-player profiles 和 market mapping 的可用状态；`data/metadata/identity-gaps.json` 也是 core required 文件，用于暴露低置信队伍、缺 sourceRef 队伍和重复 FIFA code，方便插件和 agent 判断哪些身份只能作为 fallback；`data/metadata/layer-index.json` 是 core required 导航索引，用 layerId、downloadTier、category 和 path template 告诉插件与 agent 不同问题应该拉哪些文件；`data/metadata/source-inputs.json` 记录本次生成实际读取的 raw/seed 输入文件、逻辑角色、相对路径、字节数和 sha256；`data/metadata/source-audit.json` 用机器可读方式记录当前数据源保留/切换/等待的决策，避免 agent 只靠 README 推断哪些候选源可以作为主库；`data/identification/matches.json` 是 compact core required 识别索引，把每场比赛的时间、球队 alias、场馆 alias 和 query hints 收敛到一个文件，方便插件和 agent 低成本判断当前页面最像哪场比赛。

`schemas/manifest.schema.json`、`schemas/file-index.schema.json`、`schemas/source.schema.json`、`schemas/source-inputs.schema.json` 和 `schemas/layer-index.schema.json` 记录发布包的外部契约。当前测试会检查 schema 覆盖 split index、download tier、source input provenance 和 layer navigation 的关键字段，避免 schema 文档落后于真实包结构。

`audit-package-budget` 会校验数据包规模预算：当前门禁要求全包不超过 100MB、required core 不超过 512KB、全部 core 不超过 512KB、match-context 不超过 40MB、player-context 不超过 45MB、tournament-context 不超过 10MB，并检查各 tier 最大单文件大小，避免后续数据更新悄悄拖垮插件拉取路径。它也会报告 root `manifest.json` 和 file indexes 体积；当前 root manifest 约 86KB，file indexes 已按 category/path prefix 拆成索引文件，并用 `fileDefaults` 收敛重复 metadata，合计约 8.59MB，低于 12MB 预警线。

`audit:readiness` 会读取 `coverage.json`、`identity-gaps.json` 和 `source-audit.json`，输出 `publishablePhaseA`、`completionReady`、`completionBlockers` 和 `nextGates`。当前阶段接受 clearly labelled simulated roster/profile 作为可用数据层，因此 `--simulate-squads` 生成的真实包可以达到 `completionReady=true`；最终官方名单发布仍应通过 `audit:release --final` 和 FIFA squad 输入硬门禁确认。Wikidata/FIFA 官方 team ID 现在是 identity enrichment gate：只有 `identity-gaps.json` 再次出现低置信、缺 sourceRef 或重复 FIFA code 时，才应重新变成完成阻断项。

`audit:completion` 是更高层的阶段完成度审计：它同时读取 readiness、package budget、manifest 分类索引和 layer index，按 `dataCompletenessAndSources`、`databaseStructureAndPerformance`、`classificationAndIdentifiability` 三段输出证据。它会交叉检查 coverage 和 manifest：如果 coverage 声称 rosters 或 current key-player profiles 已 available/provisional/simulated，manifest 必须真的包含对应 index 和分类。它也会读取 `source-audit.json` 的 `candidateComparisons`，如果某个候选源被标记为 `strictlyBetterThanCurrent=true` 却没有进入 `switch-now`，会把它变成阻断项。`layer-index.json` 必须包含 startup、match-detection、match-analysis、historical-player-analysis、current-roster-analysis、market-analysis 和 developer-audit 七个导航层。当前真实包结构、性能、识别分类和模拟名单层都通过，`completionReady=true`；官方 final roster 仍通过 `nextGates` 保留为后续替换任务。

`audit:source-inputs` 会读取 `data/metadata/source-inputs.json`，重新计算本地 raw/seed 输入文件的 size 和 sha256，确认当前工作区输入仍与已生成包一致。它适合放在独立数据仓库发布前，避免 raw source 已变化但 dist 包没有重建。

`audit:fifa-squads-input` 会在 roster JSON 进入生成器前先检查输入质量。默认读取 `input/raw/fifa-squads.json`；provisional 阶段可用 `--allow-missing` 保持非阻断，最终名单阶段应使用 `--expect-team-count 48 --require-final`，确保所有队伍可被 registry 识别、每队有 sourceUrl、final roster 人数为 23-26，并且没有重复队伍。

`source-audit.json` 现在包含 `candidateComparisons`：按 schedule、national-team-history、team-identity、player-identity、official-rosters、club-form/workload 和 live-sports-api 分层记录候选源、当前决策、是否严格优于当前主源、比较维度和下一道 gate。比较维度固定为 authority、license、structure、coverage、redistributability、runtimeCost。只有当候选源在关键维度上绝对优于当前组合时，才允许把 `strictlyBetterThanCurrent` 标为 true 并触发切换；否则作为 audit/enrichment/runtime-only 源使用。

`audit:release` 是发布前的一键门禁，默认串起 `validate-package`、`audit:source-inputs`、`audit-package-budget`、`audit:readiness`、`audit:completion`、`audit:fifa-squads-input --allow-missing`、三组 FIFA fixture audit 和 exact-path `audit-remote-latency`。当前使用 `--simulate-squads` 的真实包返回 `ok=true` 且 `completionReady=true`，同时会在 next gate 中提醒后续用 FIFA final squad 替换模拟名单。最终名单阶段发布时改用 `--final`，它会同时启用 `audit:completion --strict` 和 final roster 输入硬校验；也可以用 `--fifa-squads-input` 和 `--fifa-squads-expected-team-count` 指定输入路径和队伍数量。

`audit-remote-latency` 会按 manifest 下载并校验样本文件，默认测本地 `dist/phase-a-real`；发布到 GitHub 后可直接传入 raw 或 Pages manifest：

```powershell
npm run audit:remote-latency -- --manifest-url https://example.github.io/world-cup-copilot-data/manifest.json
```

它会实际 GET manifest、core、match-context、player-context 样本，校验 size/sha256，并输出每个文件和总样本的下载耗时。传入 `--paths` 且不显式传 `--tiers` 时，脚本只测 core 加这些精确路径所需的 split indexes，适合验证当前比赛懒加载路径。这个工具用于发布性能 QA，不替代 `validate-package` 和 source trust 审计。

结果：

| 指标 | 数值 |
| --- | ---: |
| indexed data files | 40,291 |
| root manifest files | 15 |
| file index files | 132 |
| root manifest size | 86,138 bytes |
| file indexes size | 8,593,192 bytes |
| largest index file | 372,290 bytes |
| explicit-path sample indexes | head-to-head `m` 101,398 bytes; team profiles 66,656 bytes; historical key-player `a` 38,501 bytes; identities `l` 100,160 bytes |
| 总大小 | 89,695,814 bytes |
| required core | 14 files / 432,989 bytes |
| all core including market mapping | 15 files / 497,594 bytes |
| core budget headroom | 26,694 bytes |
| match identification index | 1 file / 82,917 bytes |
| non-required core market mapping | 1 file / 64,605 bytes |
| coverage metadata | 1 file / 8,216 bytes |
| identity gaps metadata | 1 file / 832 bytes |
| layer index metadata | 1 file / 3,070 bytes |
| source inputs metadata | 1 file / 3,471 bytes |
| source audit metadata | 1 file / 9,962 bytes |
| schedule 文件 | 55,983 bytes |
| teams taxonomy | 186,796 bytes |
| team aliases | 62,120 bytes |
| team quality | 1 file / 268 bytes |
| venues taxonomy | 1 file / 4,565 bytes |
| history.form | 336 files / 2,698,833 bytes |
| history.headToHead | 7,481 files / 31,483,235 bytes |
| team profiles | 337 files / 1,622,556 bytes |
| historical key-player profiles | 2,723 files / 7,942,185 bytes |
| goalscorers by-player | 15,331 files / 27,470,591 bytes |
| goalscorers by-team | 220 files / 2,798,772 bytes |
| Reep player identities | 13,229 files / 8,685,708 bytes |
| simulated current rosters/profiles | 482 files / 1,591,865 bytes |
| international results | 49,257 matches, 336 teams, 198 tournaments |

这个体积不适合插件启动时全量下载。插件应先下载 `downloadTier=core` 的 required 文件，用 `data/identification/matches.json` 做页面/时间/球队/场馆的候选比赛识别，再按当前比赛懒加载对应的 `history.headToHead/*`、`history.form/*` 和 `data/profiles/teams/*`；用户问本届阵容/当前核心球员时，下载 `tournament-context` 下的 `data/rosters/worldcup-2026/*` 和 `data/profiles/key-players/current/*`；用户进入历史进球者或球员身份上下文时，再下载 `history.goalscorers/by-player/*`、`by-team/*`、`data/profiles/key-players/historical/{teamId}/*` 或 `data/players/identities/*`。`source-inputs.json` 是 core required，用于刷新判断和发布审计，不参与运行时比赛分析。

`input/team-registry.seed.json` 已覆盖 FIFA 官方小组赛 fixture 中全部 48 支队，包含稳定 `teamId`、FIFA code、常见英文名/本地名/绰号 aliases，并由 `test/team-registry.test.mjs` 守门。生成器会把这个 registry seed 注册为 `world-cup-copilot-team-registry` source，并为 registry 命中的队伍补上 sourceRefs。`data/taxonomy/team-quality.json` 会把 400 个 taxonomy team 分成 48 个 `registry/high`、288 个 `source-derived/medium` 和 64 个 `placeholder`；`data/metadata/identity-gaps.json` 当前低置信队伍、缺 sourceRef 队伍和重复 FIFA code 风险组均为 0。国家队 Wikidata/FIFA 内部 ID 不在本阶段强行手写；后续应通过稳定官方或 Wikidata 批量源单独接入，作为 provider ID 和多语言 alias 增强，而不是在当前 identity gaps 已清零时阻断发布。

非 registry 历史队伍不会再把 slug 派生的三字母短码写入 `fifaCode`。生成器会把这类短码单独放在 `derivedCode`，并且不放入 aliases；这样 agent 可以把 `fifaCode` 视为 registry/known 的较强身份信号，避免把 Belarus/Belize 这类同前缀队伍都误判成 `BEL`。

`--wikidata-teams-csv` 已预留国家队 identity reconciliation 入口，期待 SPARQL/CSV 导出列至少包含 `team`/`qid`/`wikidata_id`、`teamLabel`/`name` 和可选 `fifaCode`。导入后会写入 `data/taxonomy/team-identities.json`，把国家队实体放在 `providerIds.wikidataNationalTeam`，把 FIFA code 放在 `providerIds.fifaCountryCode`，避免覆盖 Reep 里可能表示国家/地区实体的 `providerIds.wikidata`。如果 Wikidata Query Service 不可用，可以先运行 `npm run fetch:wikimedia-team-identities -- --delay-ms 700` 走 Wikipedia API 的 pageprops `wikibase_item` 轻量路径生成同名 CSV；该路径只作为 identity reconciliation raw input，不直接替代 FIFA 官方事实。

`--fifa-squads-json` 已支持 FIFA squad announcements 衍生 JSON 输入。该输入可以是数组或 `{ "squads": [...] }`，每支队伍包含 `team`、`rosterStatus`、`announcementDate`、`sourceUrl` 和 `players[]`。生成器会输出 `data/rosters/worldcup-2026/index.json`、`data/rosters/worldcup-2026/{teamId}.json`、`data/profiles/key-players/current/index.json` 和 `data/profiles/key-players/current/{teamId}/{playerKey}.json`，并在 coverage/source-audit 中把 roster 与 current key-player profiles 标记为 provisional 或 final。2026-05-27 的官方口径仍是所有名单到 6 月 2 日由 FIFA 确认前都不是 final；因此 provisional roster/profile 只能作为带来源的当前公告事实，不能让 readiness 直接变成 completion-ready。

`data/profiles/teams/{teamId}.json` 已由公开历史赛果、goalscorers 和 team taxonomy 离线生成，走 `match-context` 懒加载。它只提供球队层面的历史画像、form、World Cup/competitive/friendly/neutral splits 和 top historical scorers，不包含 final roster 或 key-player profile；`audit:readiness` 会把 `teamProfileStatus` 标为 available，同时继续把 key-player profile 作为 completion blocker。

`data/profiles/key-players/historical/{teamId}/{playerKey}.json` 已由国家队历史进球记录和 Reep player identity 离线生成，走 `player-context` 懒加载。全局 index 只保留 team 级总览，每队还有独立 `index.json`，避免为当前球队拉取全量 2,700+ 个 profile 元数据。它的 `profileStatus=available-historical`，只能回答历史核心射手和身份映射，不能替代 FIFA final roster 后的当前核心球员画像。

`data/profiles/key-players/current/{teamId}/{playerKey}.json` 会在导入 FIFA roster 输入或启用 `--simulate-squads` 后生成。模拟模式每队生成 8 个候选，优先选择能匹配历史国家队进球记录的球员，再用明确命名的 simulated player 补齐；FIFA roster 输入模式会基于 roster 顺序和历史进球记录生成候选。它保存 club、position、shirtNumber、rosterStatus、sourceUrl、Reep identity 和最近历史进球摘要。若 rosterStatus 不是 `final`，agent 必须把它说成“模拟/公告名单候选画像”，不能当作最终名单事实。

Polymarket market mapping 支持已经接入生成器：`data/market-mapping/polymarket-query-seeds.json` 会按 `matchId`、`teamId` 和世界杯全程三层生成 query seeds。它走 core 但不是 required 文件；插件有 active data package 时优先用这些 hints 搜索，再用内置 fallback 兜底。

比赛识别索引支持已经接入生成器：`data/identification/matches.json` 会按 `matchId` 汇总 home/away 球队 alias、场馆 alias、UTC/local 时间、阶段、小组和 query hints。它走 compact JSON，是 core required 文件；插件和 agent 应把它作为“页面识别候选集”，再结合用户本地时间、页面文字、当前 tab 域名和 Polymarket 搜索结果做排序。淘汰赛 placeholder 会保留低置信身份信号，不能在球队未确定前当成真实球队。

Reep identity 支持已经接入生成器：`--reep-teams-csv` 只会生成能可靠映射到当前 team registry 的 `data/taxonomy/team-identities.json`；真实 Reep teams 当前主要覆盖俱乐部，所以本次真实包没有发布国家队 team identity。`--reep-people-csv` 会把 Reep 的 444,707 people 过滤到当前历史进球者集合，生成 `data/players/players-index.json` 和 13,229 个 `data/players/identities/{playerKey}.json`。player identity 走 player-context，避免把大体量球员表放进启动路径。

`npm run audit:fifa-schedule` 会用 `input/audit/fifa-schedule.group-stage.json` 对当前真实数据包做 FIFA 官方小组赛审计。当前 72 场小组赛队伍配对和 host-venue local date 可通过硬校验，0 mismatch。`input/audit/fifa-schedule.knockout.json` 会审计 32 场淘汰赛的占位符、阶段和 host-venue local date，确保 `1A`、`3A/B/C/D/F`、`W74`、`L101` 等都被标记为 placeholder。`input/audit/fifa-schedule.group-a.json` 仍保留为场馆 alias 抽样守门，可用 `node scripts/audit-fifa-schedule.mjs --fixture input/audit/fifa-schedule.group-a.json` 单独运行；当前 Group A fixture 报告 1 个非阻断 warning：Match 5 队伍配对一致，但 FIFA 页面与 openfootball 数据的 home/away 展示顺序不同。

## 设计边界

- 生成阶段可以做重计算；插件运行时只读当前比赛相关的小文件。
- 每条事实应保留 `sourceRefs`，指向 `data/sources/sources.json`。
- 插件永远从 `manifest.json` 开始拉取，并用 hash/schema 校验后再切换版本。
- raw source 和 dist 输出默认不入 Git；发布仓库只提交通过校验的数据包文件。
