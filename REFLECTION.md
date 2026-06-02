# Phase A 反思

日期：2026-05-26

## 当前完成的事情

- 建立了独立数据仓库雏形。
- 建立了 `manifest.json`、hash、分类、required/optional、sourceRefs 校验链路。
- `validate-package` 现在还会校验 team identity quality 语义一致性，防止 `teams.json` 与 `team-quality.json` 脱节。
- 实现了从小型 demo seed 生成 schedule、taxonomy、head-to-head、form 的 Phase A 生成器。
- 用 Node 内置测试覆盖：
  - manifest hash 和 sourceRefs 完整性。
  - head-to-head 与 form 的预计算。
  - 缺失 sourceRefs 时校验失败。
  - self-match 脏数据直接拒绝。

## 这版不够完整的地方

- 当前 seed 是 demo，不是完整真实数据库。
- 还没有直接拉取和解析 `openfootball/worldcup.json`。
- 还没有直接拉取和解析 `martj42/international_results` 的 `results.csv`、`shootouts.csv`、`goalscorers.csv`、`former_names.csv`。
- 还没有官方 2026 squad list，因为正式名单尚未发布。
- 还没有球员 identity resolution、核心球员画像、球员负荷和战术资料。
- 还没有和 Polymarket market mapping 做实体对齐。

## 是否有更完整的数据

有，但要分层使用：

- `martj42/international_results` 仍是 Phase A 国家队历史主源，因为它覆盖长历史、结构简单、许可友好。
- `openfootball/worldcup.json` 仍适合赛程结构，但 2026 完整真实赛程要等官方赛程/分组确定后再更新。
- FIFA 官方 squad PDF / FIFA.com 应作为阵容最终权威源，但它不是现在就能完整拿到的长期球员数据库。
- `dcaribou/transfermarkt-datasets` 覆盖球员、俱乐部、出场、转会、国家队 caps/goals 更完整，但原站抓取风险要继续隔离，只适合先生成内部衍生摘要。
- `withqwerty/reep` 更适合作为跨源 ID 对齐层，不应该直接替代事实数据源。
- StatsBomb Open Data 对历史世界杯事件级战术分析很好，但不覆盖 2026 实时，也不适合作为基础赛程/球员主库。

## 是否有更好的处理方式

有三个改进方向，但不应该现在一次性全做：

1. **真实导入器替换 demo seed。**
   先写 `import-openfootball-worldcup` 和 `import-international-results`，输入真实原始文件，输出统一 snapshot。这样能保持当前生成器简单，同时把复杂解析隔离出去。

2. **实体解析增加 alias confidence。**
   当前 team alias 是静态数组。后续应该给 alias 增加 `confidence`、`language`、`sourceRefs`，避免页面识别时把相似队名误配。

3. **趋势算法从简单窗口升级为轻量评分。**
   当前 form 只是 last 5/10/20 胜平负和进失球。后续可以加：
   - competitive-only form。
   - World Cup-only form。
   - neutral-site split。
   - Elo-like lightweight rating。
   - opponent-strength adjusted recent form。

## 现在不应该做的复杂化

- 不做本地 SQL 引擎。
- 不做增量 patch 更新。
- 不做自动后台大文件刷新。
- 不把 Transfermarkt 原始表打进公开数据包。
- 不让插件运行时计算全量历史 head-to-head。
- 不让 LLM 从原始大表里自己找事实。

## 下一步建议

下一步应该写真实导入器，而不是继续扩展 demo：

1. `scripts/import-openfootball-worldcup.mjs`：把真实 World Cup JSON 转成 schedule/taxonomy snapshot。
2. `scripts/import-international-results.mjs`：把 `results.csv` 转成 normalized international results。
3. 生成器继续只接收 normalized snapshot。
4. 加校验：队名映射缺失、重复 matchId、非法比分、self-match、sourceRefs 缺失。
5. 再接插件端 data puller。

## 第二轮实现后的反思

已补上真实导入器的第一版能力：可以从 openfootball 风格 JSON 和 international_results 风格 CSV 生成 normalized snapshot，再复用 Phase A 生成器。

这比直接让生成器读各种原始格式更好，因为：

- 原始格式解析和产品数据结构分离，后续换源不会影响插件数据包结构。
- 测试可以分别覆盖 importer 和 package builder。
- 插件端仍然只消费稳定格式，不关心 CSV/JSON 原始差异。

但这版 importer 仍然是保守版本：

- `teamId` 目前主要靠名称 slug 和少量已知 FIFA code 映射，不够完整。
- openfootball 的真实字段变体可能比 fixture 更多，需要在接入真实文件时补兼容。
- international_results 的 `former_names.csv`、`shootouts.csv`、`goalscorers.csv` 还没接入。
- 还没有 duplicate `matchId` 检查，未来真实导入时必须补。

下一步更好的做法：

1. 建一个 `team-registry.json`，明确 `teamId`、FIFA code、历史名称、别名、sourceRefs，不再只靠 slug。
2. 导入 `former_names.csv`，把历史队名变更显式写进 taxonomy。
3. 导入 `shootouts.csv`，让 head-to-head 能区分常规比分和点球胜负。
4. 导入 `goalscorers.csv`，为球员层和关键比赛解释准备数据。
5. 给 form 增加 competitive-only、World Cup-only、neutral-site split，先不做重模型。

## 第三轮实现后的反思

本轮补了 `team-registry`、`former_names.csv`、`shootouts.csv`、`goalscorers.csv` 的导入和分类输出。这一步比直接进入插件 data puller 更重要，因为它解决了 agent 可识别性的基础问题：同一国家队的当前名称、历史名称、别名、点球信息和进球者现在可以分开归类。

更好的做法仍然存在：

- `team-registry.seed.json` 只是种子，不是完整 registry。下一步应该用 Reep/Wikidata/FIFA code 扩成稳定主表。
- `goalscorers.json` 当前是平铺列表，后续应增加 `by-team` 和 `by-player` 索引，减少插件查找成本。
- `shootouts.json` 当前还没有回填到 head-to-head 摘要，后续应显示“常规比分/点球胜者”两个层次。
- 数据源没有整体切换。FIFA 官方赛程更权威，但不一定更适合公开再分发；更合理的是用 FIFA 做校验源，而不是替代 openfootball 基础结构源。

现在的结构没有过度复杂。新增分类都围绕 agent 识别和插件按需下载：taxonomy 放名字和身份，history 放赛事实绩，goalscorers/shootouts 作为 optional 历史增强。复杂度仍然主要留在离线生成阶段。

## 第四轮真实数据生成后的反思

本轮用真实 raw source 生成了 `dist/phase-a-real` 并通过校验。真实数据暴露了三类设计问题，已经修掉：

- openfootball 2026 淘汰赛存在 `W10` / `L10` 这类占位队名，不能当成真实国家队。现在用 `placeholder-*` 标记，并禁止为占位队生成 form 历史文件。
- `international_results` 里存在同一天同两队多场比赛，matchId 必须追加稳定序号，不能覆盖也不能丢弃。
- 完整 slug teamId 会包含连字符，head-to-head pair key 不能再用单连字符拆分，已改成 `__` 分隔。

真实包结果说明当前结构是可用的，但插件拉取策略必须更精细：

- 全包约 50.7MB，不适合默认一次性下载。
- `head-to-head` 文件多但单文件小，适合按当前两队懒加载。
- `goalscorers.json` 单文件约 21.3MB，后续应拆成 `by-team` 和 `by-player` 索引，否则查询球员进球上下文会浪费流量和 IndexedDB 读写。
- `history.form` 只有约 2.7MB，可以作为历史分析默认 optional 下载，也可以按队懒加载。

更完整、更好的后续做法：

1. 给 `goalscorers` 增加 `data/history/goalscorers/by-team/{teamId}.json` 和 `by-player/{normalized-player}.json`，保留全量文件作为可选审计文件或不发布。
2. 给 `shootouts` 汇总进 head-to-head，避免 AI 分析点球历史时还要额外扫全表。
3. 增加 `manifest` 的推荐下载层级：`core`、`match-context`、`player-context`、`audit`，插件 UI 可以让用户按层级选择。
4. 扩充 `team-registry` 到所有国家队，并引入 Reep/Wikidata/FIFA code，减少 fallback slug 的不确定性。
5. 用 FIFA 官方赛程做抽样校验，而不是替换可分发主源。

## 第五轮结构优化后的反思

本轮把第四轮列出的三个结构问题落成实现：

- `shootouts` 已汇总进 head-to-head，AI 分析两队交手时可以直接看到点球大战次数、胜者分布和先罚方分布，不需要再扫全量点球文件。
- `goalscorers` 不再输出单个 21MB 平铺文件，改为：
  - `data/history/goalscorers/index.json`：轻量总览。
  - `data/history/goalscorers/by-team/{teamId}.json`：团队 top scorers 和最近 50 个 compact goals。
  - `data/history/goalscorers/by-player/{playerKey}.json`：单个球员的完整逐球记录。
- `manifest.files[]` 增加 `downloadTier`，并把 `checksums` 从 required 改成 `audit`，插件默认只需要 209KB core 数据。

真实包重新生成后的结果：

- 全包：36,611 个 manifest files，约 78.0MB，并由 `audit-package-budget` 用 100MB 总预算守门。
- required core：9 个文件，约 319KB；all core 约 410KB，并由 512KB core 预算守门。
- match-context：7,818 个文件，约 34.4MB，head-to-head 已包含 all-time、World Cup、competitive、friendly、neutral/non-neutral split 和点球摘要；每场比赛只需要当前两队的 head-to-head/form。
- taxonomy quality：400 个 team 中 48 个是 `registry/high`，288 个是 `inferred/low`，64 个是 `placeholder`。这比把 fallback 队伍伪装成同等可信更适合 agent 判断，也给后续 Wikidata/FIFA ID 扩表留下明确待办清单。
- player-context：28,782 个文件，约 39.0MB，但只有打开进球者/球员分析时按需拉取，并由 45MB 预算守门。

这比“单个大 goalscorers 文件”更适合插件：总仓库体积略大，但运行时路径明显更轻，agent 也能用更明确的分类选择最小上下文。中间曾尝试 by-team 和 by-player 都放完整逐球记录，真实生成后膨胀到约 82MB，已回滚为“by-team 摘要、by-player 明细”的折中结构。

下一步更好的做法不是继续拆文件，而是验证真实插件拉取性能：

1. 实测 GitHub raw / GitHub Pages 下载 `core`、当前比赛 match-context、单个 player-context 的延迟；本地预算门禁已经能先防止明显的体积回退。
2. 如果 `by-player` 15k 小文件对发布或 IndexedDB 有压力，再增加首字母分片 manifest 或压缩发布层。
3. 扩充 `team-registry` 和 player identity，避免 `playerKey` 只靠 normalized name。
4. 继续观察 split 后的 head-to-head 体积；如果 GitHub Pages 或 IndexedDB 实测压力偏高，再考虑把完整 match list 与 split summary 拆成不同 tier。

## 第六轮覆盖率元数据后的反思

本轮补了 `data/metadata/coverage.json`，并把它作为 `core` required 文件发布。这不是增加新的事实库，而是给插件和 agent 一个稳定判断入口：哪些层可用、可信度如何、应该下载哪个 tier、哪些文件模式可按需读取、official roster/profile 为什么还不能当作事实使用。

这比只在 README 里写“roster 未完成”更稳，因为：

- agent 不需要靠文件名猜测数据覆盖范围。
- UI 可以直接展示“当前包缺 official roster / derived profiles”，避免用户误以为球员画像已经是完整官方数据。
- 后续接入 FIFA official squad list 后，只要 coverage 状态从 `pending-official-final-list` 改为 `available`，插件就能用同一个入口判断数据能力升级。
- 它对性能影响很小，仍走 core；真正的大文件仍留在 `match-context` 和 `player-context` 按需拉取。

这一步也暴露了更好的处理方式：后续不应该把“是否完成”散落在文档、UI 和代码条件里，而应让 `manifest.json + metadata.coverage + sources.json` 构成 agent 的三件套判断入口。剩余问题仍是事实数据本身：official roster 需要等待最终名单口径稳定并解析，GitHub raw / Pages 的真实拉取延迟仍需实测，主要历史国家队 registry 也还要继续扩充。

## 第七轮远端延迟审计后的反思

本轮补了 `audit-remote-latency`，把“发布后测 GitHub raw / Pages 下载表现”从文档待办变成可执行工具。它会读取 manifest，实际下载 core、match-context、player-context 的代表样本，校验 `sizeBytes` 和 `sha256`，并输出每个文件和总样本耗时。

这比只看本地包体预算更接近真实插件体验，因为：

- GitHub raw / Pages 的网络延迟、缓存行为和小文件请求开销只能通过实际 GET 证明。
- 代表样本会包含 core required 文件，以及 match/player tier 中体积较大的文件，能更早暴露小文件过多或单文件过大的问题。
- 脚本默认可测本地 `dist/phase-a-real`，发布后只需要替换 `--manifest-url`，不需要改代码。

这一步仍不能替代真正发布后的实测。当前仓库还没有独立 GitHub Pages 数据包 URL，所以只能证明审计逻辑和本地 file URL 路径；等数据仓库独立发布后，必须分别测 raw 和 Pages，再决定插件默认 URL 是否切到 Pages。

本轮也发现一个比单个数据文件更重要的性能问题：完整 `manifest.json` 约 13.4MB。原因是它为 36k+ 文件保存了 path/category/tier/hash/size。虽然 core 数据文件只有约 410KB，但插件检查更新第一步必须先拉 manifest，所以发布前更好的做法是把 manifest 拆成轻量 root manifest + tier/category indexes，例如 root manifest 只保留 core 文件和 index 文件 hash，`match-context` / `player-context` 的 36k 明细放到按 tier 分片的 index 里懒加载。

## 第八轮 split manifest 后的反思

本轮把上面的结论落成实现：root `manifest.json` 只保留 core 文件和 `fileIndexes[]`，非 core 文件明细被拆到 `indexes/files-match-context.json`、`indexes/files-player-context.json`、`indexes/files-audit.json`。插件端现在在拉取 optional tier 或按 path 补文件时，会先下载对应 index，校验 index 的 size/sha256，再下载具体数据文件。

真实包重新生成后的关键结果：

- root manifest：4,793 bytes，解决了启动检查必须先拉 10MB+ manifest 的问题。
- core 数据：10 files / 409,682 bytes，仍低于 512KB core 预算。
- 数据文件总量：77,998,367 bytes，仍低于 100MB 总预算。
- file indexes：13,444,494 bytes，其中 player-context index 约 10.6MB。

这说明结构方向是对的，但还没有到最终形态。下一步更好的处理方式不是回到巨型 manifest，而是继续把 index 细分：`player-context` 可以按 `history.goalscorers.byPlayer`、`players.identities`、首字母或 hash 前缀切 index；`match-context` 可以按 `history.form`、`history.headToHead`、`history.shootouts` 切。这样当前比赛只需要拉很小的索引片段，而不是整个 player-context index。

## 第九轮 prefix index 后的反思

本轮继续把第八轮的结论落成更细的结构：file indexes 不再只按 tier 拆，而是按 category 和 path prefix 拆。真实包现在有 83 个 index 文件：

- `history.headToHead` 按 pair 文件名前缀拆，例如 `indexes/files-match-context-head-to-head-m.json`。
- `history.form` 和 `history.shootouts` 保持独立索引，因为体量已经很小。
- `history.goalscorers.byPlayer` 和 `players.identities` 按 playerKey 首字母拆。
- `history.goalscorers.byTeam`、`history.goalscorers.index`、`players.index` 保持按 category 拆。

真实验证结果：

- root manifest：53,007 bytes。比 4.8KB 的 tier-only manifest 大一些，因为 root 里需要记录 83 个 index 的 hash/size/prefix，但仍远低于最初 13.4MB 巨型 manifest。
- 最大单个 index：649,618 bytes，不再有 2.7MB 的 head-to-head index 或 10.6MB 的 player-context index。
- total file indexes：13,469,802 bytes，仍略超 12MB 预警线；这是全库审计信号，不代表当前比赛会下载全量索引。
- exact-path latency sample 只拉 4 个匹配索引：form 114,535 bytes、head-to-head `m` 173,107 bytes、by-player `l` 217,557 bytes、identities `l` 174,168 bytes。

这版比“继续压 root manifest 到极小”更实用。root manifest 多 48KB 换来按路径选择索引的能力，对插件启动影响很小；真正昂贵的 13MB 明细仍留在可选路径里。现在不应该为了消除总 index warning 就盲目做二级 hash 分片，因为那会增加 manifest metadata、请求数和实现复杂度。更稳的下一步是发布到独立 GitHub 后实测 raw / Pages：如果热门前缀如 `a`、`m`、`j` 在真实网络中仍慢，再只对这些前缀做二级分片。

数据完整性方面，本轮没有发现一个绝对优于当前组合的替代源。更好的源切换仍应等待两个明确条件：FIFA official squad list 发布后接入 roster/profile；国家队 identity 需要 Wikidata/FIFA 官方 ID 批量 reconciliation，而不是把 Reep teams 误用为国家队主表。

## 第十轮 identity gaps 后的反思

本轮继续检查“数据完整性与可识别性”，发现真实包里最实质的缺口不是文件结构，而是国家队 identity 的事实置信度：400 个 taxonomy team 中，64 个是淘汰赛 placeholder，336 个是真实队伍；真实队伍里只有 48 个来自 registry/high，288 个仍是 `inferred/low`。这会影响页面识别、AI context 和后续 roster/profile 的可信边界。

本轮落地了两个改动：

- 将 `input/team-registry.seed.json` 注册进 `data/sources/sources.json`，sourceId 为 `world-cup-copilot-team-registry`，并为 registry 命中的队伍补上 sourceRefs。
- 新增 core required 的 `data/metadata/identity-gaps.json`，用机器可读方式暴露 288 个低置信真实队伍、288 个缺 sourceRef 队伍和 49 个重复 FIFA code 风险组。

真实包重新生成后的结果：

- all core：11 files / 497,167 bytes，仍低于 512KB core 预算。
- required core：10 files / 406,263 bytes，仍低于 512KB required core 预算。
- `identity-gaps.json`：80,788 bytes；曾经的明细版达到 170KB 并导致 core 超预算，已压缩掉 aliases 和重复明细，保留 agent 判断必要字段。
- 数据包总量：78,085,951 bytes，仍低于 100MB 总预算。

这一步的关键反思是：身份缺口应该显式进入数据包，而不是只留在 README 里。agent 以后可以直接读取 `metadata.coverage + metadata.identityGaps + sources` 判断：“这支队伍是否可高置信识别、是否缺 sourceRef、是否存在 FIFA code 冲突”。这比把所有低置信队伍伪装成稳定 taxonomy 更安全。

更好的数据源方面，Wikidata 的 `P3441` FIFA country code 明显是下一轮国家队 identity reconciliation 的优先候选，Wikipedia/RSSSF/FIFA code 列表也能作为交叉校验依据。但本轮实际请求 Wikimedia/Wikidata 时返回 403 Too Many Requests，不能把它作为已验证接入源。现在不应该手写 QID 或盲目复制列表；更稳的做法是等网络路径可用后，把 Wikidata SPARQL 或实体 dump 作为 raw input，批量生成国家队 identity 文件，再让 `identity-gaps` 数字下降作为验收证据。

## 第十一轮 Wikidata identity 导入入口后的反思

本轮没有把 Wikidata 事实强行写进真实包，而是先把导入入口做成可测试能力：`generate-phase-a.mjs` 支持 `--wikidata-teams-csv`，导入器接受 SPARQL/CSV 导出的 `team`/`qid`/`wikidata_id`、`teamLabel`/`name` 和可选 `fifaCode` 字段，匹配到当前 package teams 后写入 `data/taxonomy/team-identities.json`。

这里特意区分了两个 Wikidata 字段：

- `providerIds.wikidata`：保留给现有 Reep 导入值，可能是国家/地区实体或 Reep 自身映射口径。
- `providerIds.wikidataNationalTeam`：新导入的国家队实体 QID。

这个区分很重要。以 Mexico 为例，Reep fixture 里已有 `Q96`，而国家队实体可能是另一个 QID；如果直接覆盖 `wikidata`，会把两个语义不同的实体混在一起，后续 agent 和市场匹配都会变得不可靠。

现在的更好做法仍然是等待真实 Wikidata/FIFA raw export 稳定可拉取后再接入真实包。本轮测试证明导入器、source metadata、providerIds 合并和 sourceRefs 保留都能工作；但由于当前 Wikimedia 请求仍不可用，真实包不应声称已经完成 Wikidata reconciliation。

## 第十二轮 source audit 元数据后的反思

本轮继续检查“有没有更好的数据源、是否应该切换”。外部复核后结论仍然是不整体切换：FIFA squad announcements 已经是 roster 权威入口，但需要作为官方名单导入源，而不是替换当前赛程/历史主库；soccerdata 和 worldfootballR 是抓取/清洗工具，不是许可与再分发边界都绝对优于当前组合的 canonical 数据源。

这轮新增了 `data/metadata/source-audit.json`，把这些判断从文档落成 core required 元数据。它按 layer 记录：

- 当前主源是什么。
- 候选源是什么。
- 决策是 keep、audit、wait、derive summary 还是 user-key runtime only。
- 下一道验收门是什么。

真实包重新生成后的结果：

- indexed data files：36,697。
- root manifest：53,690 bytes。
- source audit：4,488 bytes。
- all core：12 files / 501,778 bytes，仍低于 512KB core 预算。
- required core：11 files / 410,874 bytes，仍低于 512KB required core 预算。
- 数据包总量：78,090,660 bytes，仍低于 100MB 总预算。

这一步比继续增加 README 文字更有价值，因为 agent 和插件可以直接读取 `coverage + identityGaps + sourceAudit + sources` 四件套来判断当前包：能用什么、不能用什么、哪些事实只能 fallback、哪些候选源还没达到替换条件。代价是 core 只增加 4.5KB，结构复杂度没有明显上升。

更好的后续做法不是再扩大 metadata，而是让这些 metadata 变成发布门禁：独立 GitHub 数据仓库每次发布前都必须跑 `validate-package`、`audit-package-budget`、`audit-remote-latency`、FIFA schedule audit，并把结果和 `source-audit.json` 中的 nextGate 对齐。若未来 Wikidata/FIFA roster 接入后没有让 identity gaps 或 roster coverage 发生可验证变化，就不应该声称数据阶段完成。

## 第十三轮 readiness 审计后的反思

本轮把“不要误判完成”也做成了命令：`audit:readiness` 读取 `coverage.json`、`identity-gaps.json` 和 `source-audit.json`，输出 `publishablePhaseA`、`completionReady`、`completionBlockers` 和 `nextGates`。默认模式允许 Phase A 继续发布；`--strict` 用于真正声明数据阶段完成前的硬门禁。

这比单纯在 final answer 里说“还没完成”更稳，因为后续 agent 可以直接跑命令得到同样结论。当前真实包应该是 `publishablePhaseA=true`、`completionReady=false`：原因不是结构问题，而是 official rosters、key-player profiles、Wikidata/FIFA team reconciliation 还没有用事实数据闭环。这个边界很重要，避免为了看起来完成而把媒体名单、抓取源或低置信队伍过早升格成 canonical facts。

## 第十四轮 FIFA provisional roster 入口后的反思

本轮复核 FIFA 当前公告口径后，没有把 roster blocker 直接消掉。FIFA squad announcement 页面已经开始集中发布各队名单，但官方仍说明 6 月 2 日确认 final list 前名单属于 provisional。因此正确做法不是把当前公告名单升格成 final roster，而是新增 `--fifa-squads-json` 导入入口，允许把官方公告衍生 JSON 作为 provisional roster 写进数据包。

这个入口输出：

- `data/rosters/worldcup-2026/index.json`
- `data/rosters/worldcup-2026/{teamId}.json`
- coverage 中的 `qualitySignals.rosters`
- source-audit 中的 `official-rosters` source decision

这让插件可以回答“当前 FIFA 公告名单里有哪些人”，但必须带 `rosterStatus` 和 `sourceUrl`，不能说这是最终名单。readiness 继续把 completionReady 保持为 false，直到 final roster 和 key-player profiles 都完成。这个处理比等待所有名单发布再写代码更好，因为数据结构、分片、sourceRef 和测试已经准备好；也比现在直接抓媒体名单更安全，因为它保留了官方来源和 provisional 边界。

## 第十五轮 team profile 画像层后的反思

本轮把 profile 拆成两层，而不是继续把“derived profiles”作为一个整体 blocker：

- `team-profiles`：已可由公开历史赛果、goalscorers 和 team taxonomy 生成，不依赖 final roster。
- `key-player-profiles`：仍等待 final roster、player identity 和俱乐部/国家队上下文。

新增 `data/profiles/teams/index.json` 和 336 个 `data/profiles/teams/{teamId}.json`，走 `match-context` 懒加载。每个 team profile 包含 all-time、World Cup/competitive/friendly/neutral splits、last 5/10/20 form、top historical scorers、recent matches 和 sourceRefs。readiness 现在会输出 `teamProfileStatus=available`；当时仍因为 official rosters、key-player profiles、identity gaps 和 Wikidata reconciliation 保持 `completionReady=false`，后续 identity gate 已改为按 `identity-gaps.json` 的实测风险判断。

真实包重新生成后的结果：

- indexed data files：37,036。
- root manifest：54,843 bytes。
- all core：12 files / 502,191 bytes，仍低于 512KB core 预算。
- required core：11 files / 411,287 bytes，仍低于 512KB required core 预算。
- match-context：8,155 files / 36,002,634 bytes，仍低于 40MB 预算。
- 数据包总量：79,733,711 bytes，仍低于 100MB 总预算。

这次增加约 1.6MB match-context，换来 agent 可直接读取球队历史画像，性价比是合理的。更好的做法不是把 team profile 放进 core，而是继续保持按当前比赛球队懒加载；本地 remote-latency 样本显示多拉一个 team profile index 约 115KB，可以接受。后续如果 GitHub Pages 实测慢，再只对 `profiles.teams` 做更细 prefix 分片。

## 第十六轮 source-derived team identity 后的反思

本轮继续审计“分类与可识别性”，发现之前把非 2026 registry 队伍全部标为 `inferred/low` 太保守：这些队伍不是凭空 slug，而是来自 `martj42/international_results`、shootouts、goalscorers 和 openfootball 结构源。正确边界应该是：

- 没有 Wikidata/FIFA QID 的历史队伍不能升格为 `registry/high`。
- 但它们可以标为 `source-derived/medium`，并带上原始 sourceRef，表示这是数据源内稳定队伍。
- `metadata.identityGaps` 应继续保留重复 FIFA code 风险，因为当前 fallback FIFA code 仍可能碰撞。

实现后真实包 readiness 从 288 个 low-confidence / 288 个 missing sourceRef 降到 0 / 0，completion blocker 也移除了 `team-identity-gaps-remain`。这比手写历史国家队 registry 更稳，因为没有把未核实的官方 ID 塞进包里；也比继续把这些队伍标成低置信更好，因为 agent 可以明确区分“来自历史主源的稳定队伍”和“等待 Wikidata/FIFA 官方 ID 的增强队伍”。

结构与性能方面，`teams.json` 因 sourceRef 增长到 189,676 bytes，仍在调整后的 192KB core 单文件门槛内；all-core 降到 483,717 bytes，required core 降到 392,813 bytes，原因是 `identity-gaps.json` 从 80KB 级别降到 29,349 bytes。这个 tradeoff 是合理的：core 总量更小，agent 风险入口更清晰；暂时不需要为 190KB 的 `teams.json` 引入 team shard，因为那会增加运行时复杂度。

外部源方面，Wikidata Query Service 仍返回 403 Too Many Requests，Wikipedia API 路径在当前网络下超时。因此本轮新增 `fetch:wikimedia-team-identities` 作为可复现的轻量补数入口，但不把它的输出伪装成已接入事实。下一步如果网络路径恢复，应优先生成 `input/raw/wikidata-national-football-teams.csv`，再用 `identity-gaps` 的 duplicate FIFA-code count 验证 reconciliation 是否真的改善。

## 第十七轮 fifaCode 与 derivedCode 分离后的反思

本轮继续追查 49 个 duplicate FIFA-code 风险，发现根因不是外部数据源缺失，而是我们把 `slug.slice(0, 3).toUpperCase()` 生成的短码写进了 `fifaCode`。这会让 Belarus、Belize、Belgium 都可能被 agent 当成同一个 `BEL` 信号，属于内部建模错误。

修正后规则更清楚：

- `fifaCode` 只保留 registry 或显式 known mapping 的代码。
- 非 registry 历史队伍的短码放入 `derivedCode`，不进入 aliases，也不参与 Polymarket code query。
- `metadata.identityGaps.duplicateFifaCodeCount` 只检查真实 `fifaCode`，不再把派生短码当成官方冲突。

真实包重建后，duplicate FIFA-code count 从 49 降到 0，`identity-gaps.json` 从 29,349 bytes 降到 832 bytes，all-core 从 483,717 bytes 降到 421,124 bytes。这个结果说明数据库结构更稳了：不是靠扩大 registry 或手写 QID 来压 warning，而是把字段语义修正到不会误导 agent。后续 Wikidata/FIFA reconciliation 仍然有价值，但它的目标应该是补官方 QID 和 provider ID，而不是弥补派生码污染。

## 第十八轮 historical key-player profiles 后的反思

本轮没有等待 FIFA final roster，而是把“历史核心球员画像”和“当前最终名单核心球员画像”拆开。前者可以由现有 CC0 goalscorers + Reep identity 生成；后者必须等 FIFA final list 后才能变成当前赛事事实。

新增 `data/profiles/key-players/historical/{teamId}/{playerKey}.json` 后，真实包变成 39,785 个 indexed files，总量 87,967,818 bytes，仍低于 100MB；player-context 46,897,684 bytes，贴近但仍低于 45MB 预算对应的 47,185,920 bytes。第一次实现把全局 key-player index 做成 577KB，超过单文件预算；这说明结构不是越集中越好。修正后全局 index 只保留 team 级总览，每队再有自己的 `index.json`，远程样本中 Argentina 的 historical key-player index 只有 65,543 bytes。

这个拆分让 agent 现在可以回答“历史核心射手是谁、他的国家队进球分布和 Reep identity 是什么”，同时仍不会误导用户说这是 2026 final roster 核心球员。更好的下一步不是继续扩大 historical profile，而是等 FIFA official final squad list 发布后，用 rosterStatus/sourceUrl 驱动 current key-player profile，并把 readiness 中的 `key-player-profiles` 从 pending 改为 available。

## 第十九轮 identity completion gate 后的反思

本轮复核 completion gate 后，发现之前把 Wikidata reconciliation 永久保留为硬 blocker 不再准确。当前 `identity-gaps.json` 已经证明低置信真实队伍、缺 sourceRef 队伍和重复 FIFA code 风险组都是 0；这说明 team identity 的运行时风险已经被 `registry/high`、`source-derived/medium`、`placeholder` 和 `derivedCode` 语义分层控制住了。Wikidata/FIFA 官方 QID 仍然有价值，但它现在是 provider ID、多语言 alias 和交叉校验增强，不应该在 measured identity risk 已经清零时阻断数据阶段。

更好的规则是让 readiness gate 跟随可验证指标，而不是跟随某个固定外部源名：

- `identity-gaps.json` 的 `lowConfidenceTeamCount`、`missingSourceRefTeamCount`、`duplicateFifaCodeCount` 任一回归，才重新出现 `team-identity-gaps-remain`。
- Wikidata/FIFA ID 接入后应改善 provider IDs、aliases 和 source refs；如果没有改善这些可观测字段，就不能宣称数据质量提升。
- 当前 completion blockers 只保留真实外部事实依赖：FIFA final rosters 和基于 final roster 的 current key-player profiles。

真实包重建后，`audit:readiness` 输出 `publishablePhaseA=true`、`completionReady=false`，blockers 只剩 `official-rosters-not-available` 与 `key-player-profiles-not-available`。这比把“未接 Wikidata”作为永久失败更稳，也避免为了通过门禁而手写 QID。后续真正更完整的做法仍是等稳定 Wikidata/FIFA raw export 可用后接入，但接入目标应是增强，而不是掩盖已经解决的 identity 风险。

## 第二十轮 source input provenance 后的反思

本轮继续检查“数据完整性与数据源”，发现 fact-level `sourceRefs` 已经足够回答“这条事实来自哪个数据源”，但还不能机器化回答“这一版发布包到底由哪些本地 raw/seed 输入生成、输入是否变过”。这会影响独立 GitHub 数据仓库后的刷新判断：如果 raw source 更新了，但没有明确 hash 记录，agent 只能靠文档或文件名猜。

新增 `data/metadata/source-inputs.json` 后，每次 CLI 生成会记录输入文件的 `inputRole`、`sourceId`、`sourcePath`、仓库相对 path、`sizeBytes` 和 `sha256`。真实包当前记录 9 个输入：openfootball 赛程、international_results 的 results/former_names/shootouts/goalscorers、Reep teams/people、team registry 和 venue registry。这个文件走 core required，但只有 3,471 bytes；all-core 从 421,740 bytes 增到 425,207 bytes，仍低于 512KB 门禁。

这比把 provenance 写进 README 更好，因为它可以被插件、发布脚本和 agent 直接读取；也比把 raw source 原文打进包里更稳，因为不会扩大运行时下载路径。更好的下一步是在独立数据仓库发布流程中用这个文件做 refresh gate：raw hash 变化时重建并跑 `validate-package`、budget、readiness、FIFA fixture audit 和 remote-latency；hash 不变时不要重复发布。

## 第二十一轮 source input audit 后的反思

本轮把上一轮的 provenance 从“可读记录”推进成“可执行门禁”：新增 `audit:source-inputs`，它读取包内 `metadata.sourceInputs`，再对当前工作区 raw/seed 文件重新计算 `sizeBytes` 和 `sha256`。真实包审计结果是 9 个输入全部 matched，0 missing，0 mismatched。

这个脚本的价值在于把“数据源是否变化”变成硬证据。否则独立数据仓库发布时，很容易出现 raw source 已更新、但 dist 仍是旧包的情况。现在发布流程可以明确变成：先跑 `audit:source-inputs`，如果不匹配就重建；重建后再跑 package validation、budget、readiness、FIFA fixture 和 remote-latency。复杂度仍然很低：没有数据库，没有后台同步，只是一个纯文件 hash 审计。

## 第二十二轮 release audit 后的反思

本轮把分散的审计脚本组合成 `audit:release`。它默认串起 package validation、source input hash、budget、readiness、FIFA group-stage / knockout / Group A fixture audit，以及 exact-path remote-latency。真实包当前 `audit:release -- --package dist/phase-a-real` 返回 `ok=true`。

这一步主要解决 agent 可识别性：以后判断数据包是否可发布 Phase A，不需要记住一串命令，也不需要从 README 里拼流程。单项审计仍然保留用于定位问题；release audit 是发布前总入口。它也刻意不把 `completionReady=false` 当失败，因为当前缺口是 FIFA final roster 和 current key-player profile 的真实外部事实依赖，而不是包结构或数据源审计失败。

## 第二十三轮 schema contract 后的反思

本轮检查到一个容易被忽略的 drift：真实包已经有 split `fileIndexes`、`downloadTier`、`indexesTier`、`pathPrefixes` 和 `source-inputs.json`，但 `schemas/manifest.schema.json` 仍停留在早期 root manifest 形态。这个问题不会立刻破坏运行时，却会在独立数据仓库发布后误导 agent、CI 或第三方消费者。

修正后，schema 文件覆盖当前外部契约：manifest schema 描述 core files 和 split indexes；source schema 保留 transform 扩展；source-inputs schema 描述 raw/seed provenance。新增 schema contract 测试只检查关键字段覆盖，不引入完整 JSON Schema validator，避免为了文档门禁增加依赖。更好的下一步是在独立数据仓库 CI 中接入正式 JSON Schema 校验，但当前保持轻量更符合“简单、耐用”的方向。

## 第二十四轮 match identification index 后的反思

本轮继续看“分类与可识别性”，发现 schedule、team aliases、venue aliases 和 Polymarket query seeds 都已经在 core 里，但 agent/插件要识别当前页面是哪场比赛时仍需要临时拼多个文件。这个路径可行，但不够清晰，也不利于后续把识别算法做成稳定契约。

新增 `data/identification/matches.json` 后，每场比赛都有一个面向识别的 compact 记录：`matchId`、home/away team aliases、venue aliases、UTC/local time、stage/group、query hints 和默认权重提示。它不替代 schedule，也不放历史统计或实时盘口，只负责让运行时更快形成候选比赛。淘汰赛 placeholder 会保留 `isPlaceholder` 和低置信身份，避免在球队未确定时误判。

第一次实现把识别索引和 Polymarket query seeds 都按 pretty JSON 写进 core，导致 core tier 超过 512KB 预算。这个失败是有用的：它说明“更好识别”不能靠扩大启动路径硬塞。修正后这两个机器索引都改成 compact JSON，并把重复的 per-match 权重、sourceRefs 和 timeSignals 收敛到顶层或已有字段。真实包重新审计结果是 all core 14 files / 488,582 bytes、required core 13 files / 423,977 bytes，继续低于预算并留出约 35KB core 余量；`audit:release` 重新通过。

更好的后续做法不是继续增加 core 字段，而是在插件里把识别评分写成可测试函数：输入页面文本、用户本地时间、tab URL、可选 Polymarket 搜索结果，输出 top candidates 和可解释 reasons。数据包只提供稳定、紧凑的候选索引；实时页面和盘口状态仍由插件运行时负责。

## 第二十五轮 extension runtime 识别索引消费后的反思

本轮把 `data/identification/matches.json` 从“可下载数据”推进到“插件实际使用的数据”。扩展运行时现在会读取 active data package 中的识别索引，挂到 `WorldCupMatch.identification`；`detectCurrentMatch` 会优先使用 data package 的 team aliases、venue aliases、query hints 和 default weights，同时保留内置赛程的 legacy fallback。

这个实现继续保持了数据包与插件职责分离：数据仓库不写复杂算法，只提供稳定、紧凑、可校验的候选信号；插件用页面文字、当前时间和运行时上下文动态打分。这样比把识别结果预先写死在数据包里更耐用，也比插件每次临时拼 schedule/taxonomy/market-mapping 更清晰。新增测试覆盖了 runtime 加载索引和 match detection 使用索引 aliases/query hints 的路径。

后续更好的方向是把识别结果 UI 里的 reasons 做得更可解释：用户看到“识别到这场比赛”时，可以展开看到命中了哪些队名、场馆、时间窗口和 market hints；但默认界面仍应保持简洁，不再显示容易误解的百分比。

## 第二十六轮 detection reasons UI 后的反思

本轮把识别原因从内部 evidence 变成用户可展开查看的 reason tags。侧边栏和 popup 仍默认只显示比赛名，不恢复百分比；用户展开“Why this match / 为什么是这场”时，能看到时间窗口、球队别名、小组文本、场馆文本、搜索提示或手动选择等简短标签。

这个选择比直接显示完整 evidence 文本更稳：完整 evidence 适合日志和测试，但对普通用户太长，也容易把“识别置信度”误解成胜率。reason tags 让判断可解释，同时不让识别区域占用过多界面空间。测试继续覆盖 detection reasons 的产生，UI 层只做轻展示，不把新状态写回数据包。

后续如果继续提升识别质量，应优先做可测试的候选排序报告，而不是扩大 UI 文案：例如为 top 3 candidates 输出 `matchId + reason tags + matched sourceFields`，供调试面板使用；默认用户界面仍保持简洁。

## 第二十七轮 candidate report 后的反思

本轮把 top candidate 输出从 UI 临时状态提升为结构化报告：`summarizeMatchCandidates` 会把识别结果压成 `matchId + label + confidence + reasons + sourceFields`，侧边栏可展开查看，AI context 也会携带最多 3 个候选。这样 agent 不只看到最终选中的 match，还能知道第二、第三候选为什么被考虑，降低页面文本模糊时的误判风险。

这一步没有改变数据包结构，也没有扩大 core 下载路径；它只是把已经存在的识别证据变成可复用结构。这个边界是正确的：数据包负责提供候选信号，插件负责运行时评分，agent/debug UI 负责解释排序。测试新增了 candidate report 和 AI context 携带路径，避免后续把它退化成仅视觉展示。

后续更好的方向是把候选报告和手动改选联动：当用户手动选择另一个候选时，可以把该选择作为本轮会话的强信号，但不要写回静态数据包，避免把个人浏览上下文污染公共数据。

## 第二十八轮 candidate manual selection 后的反思

本轮把候选报告接到了用户纠错闭环：侧边栏候选列表里的每个候选都可以直接“Use this match / 使用这场”，该操作只设置当前面板的 `manualMatchId`，沿用既有手动选择路径重新加载市场、体育数据和数据包上下文。

这个边界很重要：用户选择是会话级运行时信号，不写回 GitHub 静态数据包，也不改变公共 source metadata。这样既能让用户低成本纠正自动识别，又不会把个人页面上下文、地区平台内容或一次性误判污染到可发布数据库。复杂度也很低，没有新增存储层或同步逻辑，只是在已有候选报告上增加一个动作。

后续如果要进一步增强，可以把“用户手动选择过”作为当轮 AI context 的强信号输出给模型；但仍应保持它是 runtime context，而不是数据包事实。

## 第二十九轮 manual selection AI context 后的反思

本轮把手动选择从 UI 状态推进到 AI context：`AnalysisContext.matchSelection` 会标记 `mode=manual|auto|none` 和当前 `matchId`，LLM system prompt 明确要求当 `mode=manual` 时把该 match 当作用户选择的上下文，即使自动候选不同。

这一步解决的是 agent 判断优先级，而不是数据完整性本身。自动识别、候选报告和手动选择现在有清晰层级：静态数据包提供候选信号；运行时算法给出排序；用户手动选择覆盖本轮会话；AI 按 `matchSelection` 尊重用户选择。这个结构简单、可解释，也不会把个人纠错写回公共数据包。

后续如果做持久化，也应该只作为本机用户偏好或会话状态保存，不能进入 GitHub 数据仓库；公共数据包只能接受有来源、可审计、可复现的事实。

## 第三十轮 completion audit 后的反思

本轮把“整个数据阶段是否做完”从人工判断推进成 `audit:completion`。它不是替代 readiness，而是把三件事合到一个机器可读结果：数据完整性和来源、数据库结构和性能、分类与可识别性。默认模式允许 Phase A 可发布，同时清楚保留 `completionReady=false`；`--strict` 才用于真正声明全阶段完成。

这比继续在文档里写“还差 rosters/key-player profiles”更稳，因为后续 agent 或 CI 可以直接读取 `sections.dataCompletenessAndSources`、`sections.databaseStructureAndPerformance` 和 `sections.classificationAndIdentifiability`。当前更好的处理方式不是换成更复杂的数据库或后台服务，而是保持静态文件包加 split indexes：core 负责识别和来源，match/player context 按需拉取，completion audit 负责防止分类、体积或事实边界回退。

真正更完整的数据仍然取决于官方 final roster 和基于名单的 current key-player profiles。历史数据、球队画像、历史核心球员和识别索引已经足够支撑 Phase A 分析；但不能为了“完成”把预测名单、媒体名单或未审计 API 数据升格成 canonical facts。后续更好的算法方向是让 completion audit 读取一份可配置 goal matrix，把每个阶段的必备层和可选增强层显式化；当前先不做，是因为硬编码这三个用户目标更简单、更快，也更不容易把发布门禁复杂化。

## 第三十一轮 current key-player candidate profiles 后的反思

本轮继续推进 roster 阶段，但没有越过事实边界。FIFA 官方 squad announcement 入口已经存在，且公开说明各队名单在 FIFA 6 月 2 日确认 final list 前仍是 provisional；因此正确动作不是把 completion blocker 清掉，而是让生成器在有 roster 输入时立即产出可用的 `profiles.keyPlayersCurrent`，并把 profileStatus 保持为 `available-provisional` 或 `available-final`。

实现上，当时每队最多生成 12 个 current key-player candidate profiles：优先选择 roster 中能匹配历史国家队进球记录的球员，再按名单顺序补齐。profile 只保存可追溯字段：club、position、shirtNumber、rosterStatus、sourceUrl、Reep identity 和最近历史进球摘要。这样 agent 可以回答“当前公告名单里值得关注的人是谁”，但必须说清楚是否 provisional；后续模拟名单模式已把默认模拟规模收敛为每队 8 人。

这比等待最终名单才写代码更好，因为数据结构、分片、manifest category、coverage 状态和测试都已经准备好；也比现在抓媒体 final squad 更稳，因为不把非最终事实伪装成 canonical final roster。completion audit 也补了交叉检查：如果 coverage 声称 rosters/current profiles 可用，manifest 必须真的有对应 index 和分类，避免 metadata 和文件实际内容漂移。

## 第三十二轮 source candidate matrix 后的反思

本轮把“是否存在绝对更好的数据源”从主观说明推进成 source-audit 的候选源比较矩阵。每个关键 layer 都有候选源记录，并统一比较 authority、license、structure、coverage、redistributability 和 runtimeCost。这样 agent 不需要从散文里推断为什么没有切换：它可以直接看到 FIFA schedule 更权威但分发和结构不如 openfootball、Wikidata 更适合 identity enrichment 而不是替换 registry、API-Football/football-data.org 只能作为用户 key runtime source。

completion audit 也开始读取这个矩阵。如果未来某个候选源被标记为 `strictlyBetterThanCurrent=true`，但决策不是 `switch-now` 或明确的 `import-when-available`，审计会失败。这让用户要求的“如果有更好的数据源，直接切换，但必须绝对优于当前”变成可执行规则。当前判断仍是不整体切换：没有单一免费源在权威性、许可、结构、覆盖、可分发性和运行成本上全面优于当前分层组合。

更好的后续做法是把候选源比较矩阵也纳入独立数据仓库 release notes：每次 raw source 或候选 API 策略变化，都要说明是哪一层、哪个维度变强或变弱。现在先放在 `source-audit.json` 里是合适的，因为它已经是 core metadata，插件和 agent 都能低成本读取。

## 第三十三轮 core headroom 优化后的反思

source candidate matrix 进入 core 后，启动路径仍低于 512KB，但余量变小。本轮没有引入压缩格式或新存储层，只把 `source-audit.json` 从 pretty JSON 改为 compact JSON，并让 completion audit 输出 `requiredCoreHeadroomBytes` 和 `coreHeadroomBytes`。真实包重建后，all core 从 497,600 bytes 降到 494,095 bytes，core 预算余量为 30,193 bytes。

这个优化符合“简单、耐用”：仍然是普通 JSON，插件无需新增解码逻辑；文档继续解释字段含义，人类不需要直接阅读发布包里的格式化 JSON。更激进的做法是压缩所有 core metadata 或把 source candidate matrix 移出 required core，但那会牺牲 agent 启动时判断数据源可靠性的能力。当前更稳的边界是只压紧机器主读、体积增长明显的 source-audit。

## 第三十四轮 layer index 后的反思

本轮把“分类清晰、方便插件下载和 agent 判断”继续往前推了一步：新增 `data/metadata/layer-index.json`，用 `layerId + downloadTiers + categories + pathTemplates + useWhen` 告诉运行时每类问题该走哪条下载路径。它不是事实源，不参与比赛结论，只是导航元数据。

这比让 agent 扫 manifest 或从 README 推断更稳。比如 match detection 明确只需要 core 中的 identification/schedule/taxonomy/market hints；match analysis 再按当前两队拉 head-to-head、form 和 team profiles；current roster analysis 只有 coverage 显示 roster/profile 可用时才进入 rosters/current key-player profiles。真实包新增 1 个 core 文件，layer index 为 3,070 bytes，all core 为 497,129 bytes，仍保留 27,159 bytes 余量。

更激进的做法是把 layer index 并入 coverage，但那会让 coverage 同时承担“可用性状态”和“下载导航”两个职责，长期会变胖且难维护。单独文件更清晰，也方便后续插件只在需要下载策略时读取。

## 第三十五轮 layer index 内容审计后的反思

上一轮只把 layer index 加进包和 manifest，仍有一个弱点：文件存在不等于内容可用。本轮把 `audit:completion` 改成会读取 `data/metadata/layer-index.json` 本体，检查 startup、match-detection、match-analysis、historical-player-analysis、current-roster-analysis、market-analysis 和 developer-audit 七个导航层是否都存在，并检查关键 layer 是否包含必要 category。

这对 agent 识别很重要。没有这个门禁，后续有人可能无意中删掉 `match-detection` 或把 `profiles.keyPlayersCurrent` 从 current roster 导航里移走，但 manifest 仍然通过。现在这种 drift 会变成 completion audit 的分类阻断项。这个做法仍然保持简单：没有新依赖，没有 schema validator，只是对我们真正依赖的导航语义做最小硬校验。

## 第三十六轮 layer index schema contract 后的反思

本轮补齐 `schemas/layer-index.schema.json`，让 layer index 不只存在于生成器和审计脚本里，也进入发布包外部契约。schema 只描述关键结构：`layerId`、`downloadTiers`、`categories`、`pathTemplates`、`useWhen` 和 guidance，不尝试把所有业务语义都写成 JSON Schema。

这个边界仍然是轻量的：schema contract 测试只检查关键字段覆盖，真正的业务语义继续由 completion audit 负责。这样比引入完整 schema validator 更简单，也避免把“哪些 layer 必须存在”重复写进 schema 和审计两套规则里。后续独立 GitHub 数据仓库如果接入 CI，可以再用这些 schema 做正式校验。

## 第三十七轮 generated package hygiene 后的反思

本轮检查真实 `dist/phase-a-real` 时发现一个结构性风险：生成器清理了 `data/`、`checksums/` 和 `manifest.json`，但没有清理 `indexes/`，所以历史生成留下的旧 split index 文件会残留在发布目录。manifest 不引用这些文件，正常 hash 校验也不会读取它们；如果直接把目录推到 GitHub，插件或 agent 可能看到旧索引并误判数据结构。

修复分两层：`generate-phase-a` 写包前清理 `indexes/`，同时 `validatePackage` 扫描 `data/`、`checksums/`、`indexes/`，拒绝任何未被 manifest 或 split file indexes 引用的生成文件。这样比只依赖生成脚本更稳，因为发布前验证也能独立发现手工拷贝、旧目录复用或 CI 缓存造成的脏包。真实包重建后 manifest 记录 111 个 index，磁盘也是 111 个，extra/missing 均为 0；release audit 继续通过。

这次没有尝试把 14.66MB file index 总量压到预警线以下。原因是当前运行时已经按 path prefix 拉小片段，真实 remote-latency 样本只取相关索引；贸然把 file metadata 改成自定义短键会降低可读性并扩大契约迁移面。更好的后续是做一次“索引元数据瘦身实验”：在不破坏 manifest schema 和验证器的前提下评估能否移除 per-file 重复字段，只有收益明确且兼容成本低时再切换。

## 第三十八轮 compact split index 后的反思

本轮做了上一轮提到的索引元数据瘦身实验，并确认值得切换。split file index 内大量文件共享同一个 `category`、`downloadTier`、`required` 和 `updatedAt`，原先每条 file entry 都重复写这些字段，导致 index 总量达到 14,658,829 bytes，超过 12MB 预警线。

现在每个 split index 增加 `fileDefaults`，单条 file entry 只保留真正变化的 `path`、`sha256`、`sizeBytes`、`recordCount` 等字段。读取侧在 `validatePackage`、`audit-package-budget`、`audit-completion` 和 `audit-remote-latency` 里统一展开，外部契约用 `schemas/file-index.schema.json` 记录。真实包重建后 index 总量降到 8,476,012 bytes，release audit 不再有 file index warning，remote-latency 样本总下载量从约 1.12MB 降到约 0.89MB。

这个方案比短字段名或压缩二进制更稳：仍然是普通 JSON，仍可直接调试，根 manifest 的 file index 条目不变，插件只需要在读取 split index 时支持 `fileDefaults`。它也比单纯提高预算更诚实，因为确实减少了重复数据，而不是把警戒线调宽。后续再优化时，应优先考虑让插件按 exact path 直接推导 index path，而不是继续增加全局索引。

## 第三十九轮 FIFA squad input audit 后的反思

本轮重新核对 FIFA 当前说明后，结论没有改变：2026-06-02 前所有 squad announcement 仍应视为 provisional，不能把 full data completion 的 blocker 清掉。但可以把 roster 入口本身做得更硬：新增 `audit:fifa-squads-input`，在 `fifa-squads.json` 进入生成器前检查队伍是否命中 registry、是否缺 sourceUrl、是否重复、final roster 是否 23-26 人，以及是否已满足 48 队最终名单要求。

这比直接把 FIFA 页面文本抓进 canonical 数据更稳。页面结构可能变化，且当前阶段事实状态仍是 provisional；我们先把输入 JSON 的质量门禁做好，等最终名单出现时，只需要把已整理的 JSON 放进 `input/raw/fifa-squads.json`，跑 `audit:fifa-squads-input -- --expect-team-count 48 --require-final`，再生成真实包。这样 final roster blocker 会由事实输入和机器审计共同解除，而不是靠人工判断。

## 第四十轮 release roster gate wiring 后的反思

上一轮新增了 `audit:fifa-squads-input`，但如果它只停留在独立命令，CI 或 agent 仍可能跑 `audit:release` 时漏掉 roster 输入预审。本轮把它接入 release audit：默认使用 `--allow-missing`，所以当前 Phase A 没有 `input/raw/fifa-squads.json` 也不会阻断发布；最终名单阶段则用 `--require-final-fifa-squads` 切换成硬门禁。

这个设计避免了两个极端：一是现在就因为最终名单未到而阻断 Phase A；二是最终名单到了以后仍靠人工记得多跑一个命令。更好的方式是 release gate 本身表达阶段差异：provisional 阶段允许缺失但显式 warning，final 阶段要求 48 队、registry 命中、sourceUrl、人数范围和去重全部通过。

## 第四十一轮 final release strict mode 后的反思

上一轮 final roster gate 已经接入 release audit，但仍有一个边界问题：只加 `--require-final-fifa-squads` 只能证明 roster 输入够严格，不能证明整个数据阶段的 `completionReady` 已经为 true。本轮新增 `audit-release --final`，它会同时把 `audit-completion` 切到 `--strict`，并把 FIFA squad 输入切到 final 硬校验。

这个模式把 Phase A 发布和全数据阶段完成明确区分开。普通 `audit:release` 用于“当前包可发布、但 completion blockers 仍可存在”；`audit:release --final` 用于“我要声明整个数据阶段完成”，此时 official rosters、current key-player profiles、结构预算、分类识别和 final roster 输入都必须一起通过。这样比要求人记住多个命令更耐用，也更符合最终完成必须由证据证明的原则。

## 第四十二轮 simulated squads 后的反思

本轮根据产品决策调整了完成口径：官方 final roster 不再阻塞当前数据阶段，未公布的数据先用明确标注的模拟名单替代。生成器新增 `--simulate-squads`，只在没有 `--fifa-squads-json` 时生效；它基于 48 支参赛队和历史国家队进球记录，为每队生成 8 个 current key-player candidate，并把 roster/profile 状态写成 `simulated` / `available-simulated`。这样插件可以继续做阵容和球员分析，但 agent 必须明确说这是模拟名单，不能冒充 FIFA 官方事实。

第一次实现每队 12 人时，真实包虽然总量仍低于 100MB，但 `player-context` 超过 45MB 预算。真正的问题不是人数本身，而是分层语义不准：本届赛事名单和当前核心画像不该放进历史球员大库。修正后新增 `tournament-context` 路径，`data/rosters/worldcup-2026/*` 和 `data/profiles/key-players/current/*` 走赛事上下文懒加载，`player-context` 继续只承载历史进球者、历史关键球员和 Reep identities。

重建真实包后，`audit:completion` 和 `audit:release` 都返回 `ok=true`，`completionReady=true`；核心数据 497,594 bytes，整体 89,695,814 bytes，`tournament-context` 只有 1,591,865 bytes，`player-context` 回到 46,897,684 bytes，低于 45MiB 预算线。这个处理比单纯提高预算更好，因为它让插件下载策略更清晰：启动只拉 core，当前比赛分析拉 match-context，本届阵容拉 tournament-context，历史球员深挖才拉 player-context。

后续更完整的数据源仍然是 FIFA final squad 输入，而不是把模拟名单继续扩成事实库。更好的算法方向是保留当前 fallback：官方 final JSON 一旦存在，生成器自动停止使用模拟名单；release final 模式继续要求 48 队、sourceUrl、final status 和人数范围全部通过。这样当前阶段可以前进，未来官方事实也有明确替换路径。
