# 语音控制桌面端（网易云音乐）可行性与实现方案

## 1) 结论（先看这个）
- 可行性：高（Windows 最稳），中等（macOS 需额外权限），中等偏低（Linux 取决于播放器是否实现 MPRIS）。
- 建议路线：先做“语音识别 + 指令解析 + 媒体键注入”的 MVP，优先实现 `播放/暂停`、`上一首`、`下一首`、`音量增减`。
- 不建议一开始深耦合网易云内部接口（逆向协议成本高、版本易变）。先走系统标准控制链路，再在第二阶段补“网易云专属动作”。

## 2) 可行性评估

### 2.1 系统级播放控制可行
- Windows 可通过 `SendInput` 注入键盘事件控制媒体键，官方 API 明确支持合成按键/鼠标输入，并说明完整注入语义和完整性级别限制（UIPI）。
- Win32 虚拟键值里包含 `VK_MEDIA_PLAY_PAUSE`、`VK_MEDIA_NEXT_TRACK`、`VK_MEDIA_PREV_TRACK`、`VK_MEDIA_STOP`，可直接映射到语音命令。
- 这条路径的核心优点：不绑定网易云版本，任何响应系统媒体键的播放器都可复用。

### 2.2 全局唤醒/快捷键可行
- 若用 Electron 客户端，`globalShortcut` 可在应用失焦时注册全局快捷键；但快捷键被其他应用占用时会静默注册失败，需加检测与降级。
- Electron 文档也给出 Wayland 下的 `GlobalShortcutsPortal` 路径，说明 Linux 桌面环境需要做平台差异处理。

### 2.3 语音识别可行
- Whisper 官方仓库说明其是通用多语言语音识别模型，支持多任务（识别/翻译/语言识别），可作为高准确率方案。
- Vosk 官方说明其支持离线识别、流式 API、较小模型（约 50MB）和多语言，适合低延迟本地 MVP。
- 结论：工程上可做“双引擎策略”（默认离线，必要时切换更高准确率）。

### 2.4 权限与平台风险可控
- Windows 端需确认麦克风权限（系统设置里“允许桌面应用访问麦克风”）。
- macOS 端除麦克风外，如要全局键盘/辅助功能操作，需要辅助功能信任（`AXIsProcessTrustedWithOptions`）。
- 若做原生 macOS 语音引擎，`SFSpeechRecognizer` 可用，但官方提到某些语言场景可能依赖网络并受服务限制。

## 3) 推荐架构（MVP 到可商用）

```text
Mic Input
  -> VAD(可选)
  -> ASR(默认 Vosk / 可切 Whisper)
  -> Intent Parser(规则优先)
  -> Command Router
  -> Executor
      A. MediaKeyExecutor(默认)
      B. AppAutomationExecutor(网易云专属，二期)
  -> Feedback(提示音 + Toast + 日志)
```

## 4) 指令设计（先做最小闭环）
- 播放/暂停：`播放`、`暂停`、`继续`、`停止音乐`
- 切歌：`下一首`、`上一首`
- 音量：`调大音量`、`调小音量`、`静音`
- 作用域：默认控制“当前系统活动媒体会话”；二期加入“仅控制网易云”模式

## 5) 技术选型建议
- 语言与运行时：Python（MVP 开发最快）
- 音频采集：`sounddevice` 或 `pyaudio`
- ASR：
  - 首选：Vosk（离线、低延迟）
  - 备选：Whisper（高准确率）
- 指令解析：规则模板 + 同义词词典（先不用 LLM）
- 执行层：
  - Windows：`ctypes` 调 `SendInput`
  - macOS：先走系统事件注入；涉及全局控制时处理辅助功能权限
  - Linux：优先 MPRIS（播放器支持时）
- UI：托盘应用（状态、麦克风开关、日志）

## 6) 分阶段实施

### Phase 1（2-4 天）- POC
- 完成实时拾音与一句话识别
- 完成 6 条核心命令到媒体键映射
- 在网易云前台/后台验证可用率
- 输出：可运行 Demo（命令行）

### Phase 2（4-7 天）- MVP
- 增加唤醒词（如“音乐助手”）与静默超时
- 增加误触防护（置信度阈值 + 二次确认可选）
- 增加托盘 UI、日志与错误提示
- 输出：可日常使用的桌面助手

### Phase 3（7-10 天）- 稳定化
- 增加网易云专属模式（窗口识别/进程识别）
- 增加自动化回归（音频样本回放）
- 打包发布（Win 安装包、开机启动、配置导入导出）

## 7) 风险与规避
- 识别误判：用关键词约束 + 置信度阈值 + 热词表。
- 快捷键冲突：启动时自检全局热键注册结果，失败时提示改键。
- 系统权限问题：首次启动做权限向导（麦克风/辅助功能）。
- 播放器行为不一致：执行器分层，优先标准媒体键，必要时加 App 专属执行器。

## 8) 验收标准（建议）
- 功能：6 条命令全部可用；连续 30 次命令无崩溃。
- 时延：本地识别到动作触发 P95 < 800ms（离线模型可接受范围内）。
- 正确率：安静环境命令识别正确率 > 95%。
- 稳定性：后台运行 4 小时内无明显内存泄漏或卡死。

## 9) 下一步建议（你确认后我可以直接开做）
- 方案 A（推荐）：先做 Windows MVP（Python + Vosk + SendInput），1 周内给可用版本。
- 方案 B：直接做跨平台骨架（Win/mac/Linux），周期更长但后续扩展成本更低。

---

## 参考依据
- Microsoft Learn: SendInput（合成输入、UIPI 约束）
- Microsoft Learn: Virtual-Key Codes（含媒体键 VK_MEDIA_*）
- Electron Docs: globalShortcut（全局快捷键注册、占用失败、Wayland Portal）
- OpenAI Whisper README（多语言通用语音识别模型）
- Vosk 官方/GitHub（离线、流式、小模型）
- Apple Docs: AXIsProcessTrustedWithOptions（辅助功能信任）
- Apple Docs: NSMicrophoneUsageDescription（麦克风权限声明）
- Apple Docs: SFSpeechRecognizer（可用性、部分语言可能需网络）
- freedesktop: MPRIS v2.2（Linux 媒体控制标准）
