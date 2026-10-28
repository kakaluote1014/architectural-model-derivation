# v0.1 输入与运行

运行环境：Node.js 18+；构建仅使用标准库。浏览器需WebGL。QA另需本机已有Playwright和Chromium/Chrome/Edge，不自动下载或安装。

```powershell
node <skill>/scripts/model_web.mjs inspect --model mesh.json
node <skill>/scripts/model_web.mjs init --model mesh.json --config project.json
node <skill>/scripts/check_routes.mjs --model mesh.json --config project.json --out qa/routes.json
node <skill>/scripts/model_web.mjs build --model mesh.json --config project.json --out output
node <skill>/scripts/qa_browser.cjs --dir output --browser <浏览器可执行文件> --playwright <Playwright模块目录>
```

相对路径按运行目录解析；配置中列出的 `sourceFiles` 按配置目录解析。输出目录必须不存在，避免覆盖。`init`同样拒绝覆盖。无需全局安装；将整个Skill目录载入支持本地Skill的环境即可，或直接调用脚本。

只有配置了人物路径时才运行 `check_routes.mjs`。人物、路径、动作与来源字段见[活动与流线](activities.md)；没有相关资料时无需创建routes表。

## 网格JSON

最小 `{ "coordinate_system":"metres, Y up", "meshes":[{"name":"对象","positions":[0,0,0,1,0,0,0,1,0],"color":[220,220,210],"alpha":1}] }`。

`positions` 为展开的三角形顶点，长度为9的倍数，单位m、Y向上。可有 `source_id, zone, level, kind, tag` 分类元数据，不据此自动确认设计。已有B组 `live_mesh.json` 可直接读取；其坐标已累计实例变换，生成器不重复变换。保留所有输入三角形，不自动修补、封口或简化。v0.1不直接读SKP、IFC、OBJ或GLTF。

## 配置（按需扩展）

`init`按包围盒生成可运行的整体观察脚本，**不会识别功能、楼层或设计史**。解析项目仅需 `title, mode:analysis, source, chapters, keyframes`；生成的默认镜头须人工查看。可编辑项：

- `source.scope`：来源身份，如“既有导出/工作模型”；`source.coordinateSystem`、`source.originMm` 及 `source.transform` 记录坐标关系；`sourceFiles` 可列源SKP/快照/工作数据以核验哈希，不会嵌入SKP。
- `focusZones`：目标对象的zone；未设置则包含所有网格。
- `floors`：`{id,label,level,elevation,offset}`，level匹配输入元数据，elevation为源标高m，offset为展开位移m，标签用源标高。屋面可单列一个展示层。输入同一网格跨多层时不能凭空切割，应在上游重新分类或不展开。
- `roofKinds`、`trafficKinds`：匹配kind，例如 `roof`、`stair`；无匹配时相应按钮禁用。
- `spaces`：`{label,center:[x,y,z],size:[宽,深],color:"#...",floorId,evidence,scope}`，仅在有来源时启用，水平示意面，不计算净面积。
- `labels`：`{text,position:[x,y,z],floorId}`；跟随其展示层位移。仅为辅助空间标注，不代表新模型构件。
- `controlTimes`：可选 `{functions:秒数,traffic:秒数}`，点击对应控制时转到已编写的观察镜头，避免从整体远景勉强看局部；未设置时保持当前相机。
- `chapters`：`{t,title,text,evidence}`，首章0、时间严格递增，证据可简写为源文件与对象。每章至少一个问题与短字幕。
- `keyframes`：`{t,eye:[x,y,z],target:[x,y,z],state:{explode,roof,traffic,functions,focus}}`，每帧五个状态均为0..1。首帧0、最后一帧决定时长，最后状态全0以归位。相邻帧平滑插值，重复eye/target提供停留。上下文淡化由focus控制。

`build`输出 `index.html`（内联依赖和数据，双击离线运行）、`dist/`（可编辑脚本/样式/数据/本地依赖）、`provenance.json`（输入哈希、坐标、网格和float32误差）、`shot-script.md`（可审阅脚本）、`THIRD_PARTY_NOTICES.txt`。网页由导出数据生成；来源路径是记录，不会自动读取正在打开的建模软件。
