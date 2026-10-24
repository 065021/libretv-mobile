# 手机 App（Android / iOS）

LibreTV 的界面 **和** 服务端逻辑全部打进 App，**不需要部署任何服务器**，装完即用。

---

## 一、改造思路

改造前：浏览器只负责界面，搜索聚合、详情解析、m3u8 重写、视频/图片反代、直播测活、鉴权全部在
`src/app/api/*` 的 Route Handler 里跑（服务端）。

App 版本只动了两处，服务端那 15 个接口的业务代码**一行没改**：

1. **静态导出** —— `next build` 用 `output: 'export'` 产出纯静态资源，Capacitor 把它们打进 WebView；
2. **本地路由** —— `src/mobile/runtime.ts` 在入口拦截 `window.fetch`，把 `/api/*` 的请求直接交给
   原来的 Route Handler。这些 Handler 现在跑在 WebView 里，而不是服务器上。

Node 专属的依赖由 `next.config.ts` 在构建期做模块替换，换成浏览器替身：

| 服务端依赖 | App 内替身 | 原因 |
| --- | --- | --- |
| `next/server` | `src/mobile/shims/next-server.ts` | 只实现 `NextResponse.json` / `new NextResponse()` |
| `@/lib/auth` | `shims/auth.ts` | App 是单机形态，没有密码登录 |
| `@/lib/api-guard` | `shims/api-guard.ts` | 同上，恒放行 |
| `@/lib/ssrf` | `shims/ssrf.ts` | 请求由用户自己的设备发出，没有服务端越权面；同时要支持局域网自建源 |
| `@/lib/fetch-utils` | `mobile/server/fetch-utils.ts` | 底层换成原生 HTTP |
| `node:crypto` / `node:zlib` / `node:dns` | `shims/*.ts` | 浏览器没有同步实现 |

### 三个真正的难点

**① 跨域。** 采集站、豆瓣图床、IPTV 源几乎都不发 `Access-Control-Allow-Origin`，
WebView 里直接 `fetch` 必被拦。所有出站请求统一走 `src/mobile/native-http.ts` →
Capacitor 原生 HTTP（Android: OkHttp / iOS: URLSession），不经过渲染进程，因此不受同源策略约束，
还能自定义 UA / Referer（豆瓣封面防盗链要用）。

**② 播放器。** hls.js 默认用 `XMLHttpRequest` 取 m3u8 和分片，同样会被 CORS 拦。
`src/mobile/hls-loader.ts` 提供一个基于 fetch 的 loader 替换默认实现；点播侧的广告过滤与分片缓存
逻辑不受影响（`createHlsLoader` 现在支持传入自定义基类 loader）。

**③ 封面图。** `<img src="/api/proxy?url=...">` 在打包产物里并不存在这个路径。
`SmartImage` 在 App 内会先取回二进制、转成 `blob:` URL 再交给 `<img>`。

---

## 二、构建

环境要求：Node.js 20+、JDK 21、Android SDK（Platform 36 与 Build-Tools 35.0.0）、Gradle 8.14.3。
`android/gradle/wrapper/gradle-wrapper.properties` 已指向 Gradle 8.14.3，`./gradlew` 首次运行会自动下载
（需要能访问 `services.gradle.org`；也可装同版本 Gradle 后直接用 `gradle assembleDebug`）。

```bash
npm install
npm run mobile:build        # 静态导出 + cap sync android/ios
```

产物：`out/`（静态资源）、`android/`、`ios/`。
只导出、不刷原生工程：`node scripts/mobile/build.mjs --no-sync`。

### 本地打安卓包

```bash
cd android
./gradlew assembleDebug          # Windows 用：gradlew.bat assembleDebug
# 产物：android/app/build/outputs/apk/debug/app-debug.apk
```

- 报 `Failed to find Build Tools revision 35.0.0`：AGP 8.13 默认需要 Build-Tools 35.0.0，用
  `sdkmanager "build-tools;35.0.0" "platforms;android-36"` 装上即可（GitHub Actions 的 setup-android 会自动装）。
- 版本号在 `android/app/build.gradle`：`versionCode 219` / `versionName "2.19.0"`，发版时与 `package.json` 的
  `version` 一起改。
- 本项目已在 Windows + JDK 21.0.12 + Gradle 8.14.3 + Android SDK 36 实机构建通过（2026-10）。

### 本地打 iOS 包（需要 macOS + Xcode）

```bash
npm ci
node scripts/mobile/build.mjs --no-sync
npx cap sync ios
npx cap open ios              # Xcode 打开 ios/App/App.xcodeproj，选好 Team 后真机运行 / Archive
```

Capacitor 8 用 Swift Package Manager 管理依赖，不需要 CocoaPods（见 `ios/App/CapApp-SPM/Package.swift`）。
`ios/App/App.xcodeproj/xcshareddata/xcschemes/App.xcscheme` 是 CI 用的共享 scheme，**必须入库**，不要忽略它。

不签名出 ipa（自测或后续重签名用）：

```bash
cd ios/App
xcodebuild -project App.xcodeproj -scheme App -configuration Release -sdk iphoneos \
  -destination 'generic/platform=iOS' -derivedDataPath build \
  CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO CODE_SIGN_IDENTITY="" build
mkdir -p build/Payload && ditto build/Build/Products/Release-iphoneos/App.app build/Payload/App.app
(cd build && zip -qry ../LibreTV-unsigned.ipa Payload)
```

> `cap sync ios` 在 Windows/Linux 上也能执行（只复制 Web 资源并生成 `capacitor.config.json`），
> 只有 Xcode 构建这一步必须 macOS。

### 云端出包（推荐，无需本地环境）
`.github/workflows/mobile-build.yml`：在 Actions 页面手动触发，或推 `v*` 标签自动构建，产出两个 artifact：

- `libretv-android-apk` —— debug APK，下载后可直接安装（需允许「安装未知来源应用」）；
- `libretv-ios-ipa` —— 未签名 ipa，需要用 AltStore / Sideloadly / 自有证书签名后安装。

正式发布签名：

- **Android**：生成 keystore，在 `android/app/build.gradle` 配 `signingConfigs`，CI 里用 Secrets 注入；
- **iOS**：Xcode 里配好 Team 与描述文件，或使用 App Store Connect API Key 走 `xcodebuild -exportArchive`。

### 已构建产物（本次改造，可直接安装）

- Android：`android/app/build/outputs/apk/debug/app-debug.apk`
  （约 5.3 MB，`com.libretv.app`，versionName 2.19.0 / versionCode 219，debug 签名，可侧载安装）。
  本次构建 SHA256：`BA55D31446EEC70002C1719D931CF5AE64C22EDE4923B364DF57E97F480A2322`
- 安装：手机端打开「允许安装未知来源应用」后点开 APK；或 `adb install -r app-debug.apk`。
- iOS：Windows 无法产出 ipa，请用上面的 macOS 步骤或 GitHub Actions 出未签名 ipa，
  再用 AltStore / Sideloadly / 自有证书重签名安装。

### 验证情况（2026-10-24）

- TypeScript：`npx tsc --noEmit` 通过。
- 静态导出 + 原生运行时模拟：Playwright（Chromium，390×844 移动视口，注入 Capacitor 假桥与原生 HTTP 桩）
  对 `out/` 跑 42 项检查，**42/42 通过**：页面路由/资源、`/api/*` 本地 dispatch、`/api/proxy`
  （png / 302 / Range 206 / m3u8 改写）、代理封面图 blob、hls-loader 拉 master+variant、搜索/详情/播放页交互，
  `pageerror` 0、`requestfailed` 0。
- iOS 工程静态校验 106 项通过（共享 scheme、SPM 8.5.3、Info.plist ATS 与本地网络说明、CI 流程）。
- 修复记录：App 内曾因 `/api/status` 在「无密码」时返回 `verified:false`，导致 `/watch`、`/live` 一直停在
  「等待访问验证...」；已改为无密码即放行（`verified = !passwordRequired || 会话有效`）。
- 说明：以上是在桌面 Chrome 中模拟 WebView 原生桥的验证；真机系统级行为（视频硬解、局域网权限弹窗、
  后台音频、横竖屏）建议安装后自测确认。

---

## 三、预置数据源（可选）

App 没有部署环境变量。如果希望装上就有源可用，在**工程根目录**放下面任意一个文件再构建，
内容格式与 Web 版对应的环境变量完全一致：

| 文件 | 对应环境变量 | 格式 |
| --- | --- | --- |
| `mobile-sources.json` | `DEFAULT_SOURCES` | `[{"name":"源名","url":"https://xxx/api.php/provide/vod","detail":"https://xxx"}]` |
| `mobile-live-sources.json` | `DEFAULT_LIVE_SOURCES` | `[{"name":"直播源","url":"https://xxx/list.m3u","epg":"https://xxx/epg.xml.gz"}]` |
| `mobile-subscriptions.json` | `DEFAULT_SUBSCRIPTIONS` | `["https://xxx/sources.json"]` |

不放这些文件也能用：App 与「自建 Web 版未配置 `DEFAULT_SOURCES`」行为一致，
用户可在设置里手动添加采集站、或导入一份 SourceList 订阅链接。
这三个文件不进版本库（已在 `.gitignore` 中），属于各人自己的分发配置。

---

## 四、与网页版的差异

| 功能 | App 内表现 | 说明 |
| --- | --- | --- |
| 密码登录 | 无 | 单机使用，没有多用户/部署者概念 |
| HTTP-FLV 直播 | 不支持 | FLV 是单一无限长连接，原生 HTTP 通道是缓冲式读取，拿不到增量数据。HLS 直播正常 |
| 画质徽章（AES-128 加密分片） | 显示「未知」 | 浏览器没有同步 AES 解密 API；播放本身不受影响 |
| 局域网自建源 / 内网 IPTV | 支持 | App 内不做内网地址拦截 |
| 下载管理 | 保持原逻辑 | 走浏览器内 blob 下载 |

---

## 五、目录结构

```
src/mobile/
  platform.ts            运行环境判定（编译期常量 + 原生桥）
  runtime.ts             /api/* 拦截与本地分发
  native-http.ts         原生 HTTP 传输层
  hls-loader.ts          hls.js 原生 loader
  image.ts               代理图片 → blob URL
  native-shell.tsx       安卓返回键等原生交互
  server/
    router.ts            本地路由分发器
    routes.generated.ts  构建期生成的接口表（勿手改）
    route-types.ts       接口模块类型
    fetch-utils.ts       上游请求（原生版）
  shims/                 Node / Next 依赖的浏览器替身
scripts/mobile/build.mjs 移动端构建脚本
capacitor.config.ts      Capacitor 配置
android/  ios/           原生工程
```

---

## 六、注意事项

- 静态导出不允许存在 Route Handler，所以构建脚本会把 `src/app/api` **临时**改名为 `src/app/_api`
  （App Router 中下划线前缀目录不参与路由），构建完自动改回。脚本用 `try/finally` + 信号处理保证还原；
  万一进程被强杀，手动把 `src/app/_api` 改回 `src/app/api` 即可。
- `android/app/src/main/assets/public/`、`ios/App/App/public/` 是 `cap sync` 生成的 Web 资源副本，
  已在 `.gitignore` 中排除，不要提交。
- App 内允许明文 HTTP（`android:usesCleartextTraffic` + iOS `NSAllowsArbitraryLoads`）：
  大量 IPTV 源与采集站仍是 `http://`，不放行会整片播不了。这也意味着上架应用商店时需要在
  隐私/合规说明里写清楚。
- 图标与启动图已由 `public/icons/icon-512.png` 生成并写进 `android/`、`ios/` 两个原生工程；
  换图标时替换该源图后用 `npx @capacitor/assets generate` 重新生成即可。
