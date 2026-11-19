# 试穿搭子 · B 版

**[打开在线展示页](https://ethan101-liu.github.io/tryon-buddy/)** · **[下载单文件 Demo](https://github.com/Ethan101-Liu/tryon-buddy/raw/refs/heads/main/docs/index.html)**

打开展示页先看到首页，点击「试穿对话」进入工作台。可以浏览女士、男士和童装系列，拖动对比、切换穿搭案例和放大图片。单文件 Demo 已内嵌图片、样式和脚本，下载后用浏览器打开即可。在线展示与离线 Demo 的 AI 搜衣、上传审核和生成需要完整项目后端及使用者自己的服务配置。

### 首页

![试穿搭子首页，女士系列展示奶油针织和棕色外套的上身对照。](docs/homepage.png)

### 试穿工作台

![试穿搭子工作台，中栏试穿对话，右侧展示衣服原图、示例人物与试穿结果。](docs/workspace.png)

## 项目做什么

试穿搭子是一个支持电脑与手机的中文 AI 试衣框架。上传本人照和衣服图片，或描述想穿的单品、场合，再查看试穿效果、比较版本、继续替换单品。前端采用原生 HTML、CSS 和 JavaScript，Python 后端负责搜衣、图片检查、生成任务与结果返回。

默认实现接入阿里云百炼和图片审核服务。使用者配置自己的密钥与额度，也可以按 [模型接入说明](docs/model-integration.md) 替换理解、识图、生成或审核服务。

## 从打开页面到选定穿搭

1. **进入试穿对话**。首页展示系列案例，点击顶部「试穿对话」或底部入口进入工作台。
2. **准备本人照**。点击「添加本人照」上传人物照片，也可使用当前浏览器已保存的照片。完整后端支持读取 HEIC 并转换图片。换下装时需要能够看清相应部位。
3. **提供衣物或说明需求**。用「传衣服图」上传商品图，或从「我的衣服」选择单品。还没有挑好时，输入「换个卫衣」或「周一面试，想穿裤子」，后端理解需求、搜索候选并核对衣物图。
4. **确认搭配并生成**。根据对话补充缺少的照片、单品或场合信息。输入图片检查通过后创建生成任务，多件搭配按顺序编辑，尽量保留人物、画幅和未替换的衣物。
5. **查看进度与处理失败**。工作台显示搜索、生成和审核状态。结果审核暂时失败时保留生成结果，支持继续审核，避免为同一结果重复生图。运行中任务保存在后端内存，重启后不会继续。
6. **查看效果并比较版本**。放大成图，比较前后搭配。可以保留上衣换下装，或选回旧版本继续搭配。
7. **保存与回看**。成图可在「试穿记录」回看，喜欢或待定的款式加入「备选」。衣物、账号演示数据及历史记录以当前浏览器为单位保存。

### 用户主流程图

下图为项目的完整产品流程设计，包含从素材准备、单件或成套试穿到对比和备选的路径。它也包含批量任务、手动框选和同批两图比较等设计目标，具体可用能力以本仓库 B 版界面及下方范围说明为准。

![试穿搭子用户主流程图](docs/user-flow.png)

[打开原尺寸流程图](docs/user-flow.png)

## 第一次运行：用自己的百炼账号接入模型

下面以项目已经支持的阿里云百炼为完整示例。你需要准备自己的模型密钥和图片审核凭据。理解需求、识别衣物、生成试穿图会调用百炼，上传图片和成图检查会调用阿里云图片审核，相关调用由你的账号计费。

### 1. 下载项目，找到要操作的文件夹

在本仓库页面点击绿色 **Code → Download ZIP**，下载并解压。打开解压后的文件夹，里面应能看到 `serve_demo.py`、`requirements.txt` 和 `README.md`。后文把这一层叫作“项目根目录”。

也可以用 Git 下载，在终端逐行执行。

```bash
git clone https://github.com/Ethan101-Liu/tryon-buddy.git
cd tryon-buddy
```

通过 ZIP 下载时，在终端输入 `cd `（末尾有一个空格），再填入解压后的文件夹路径。路径包含空格时用双引号包起来。例如解压后的文件夹通常叫 `tryon-buddy-main`，以你电脑上的实际名称为准。后续命令均在项目根目录执行。

### 2. 安装 Python 和项目依赖

先安装 Python 3.12。Windows 安装时勾选“Add Python to PATH”，完成后重新打开终端。下列两组命令按自己的系统选择一组，逐行执行。

**macOS / Linux**

```bash
python3.12 --version
python3.12 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
python -m pip check
```

**Windows PowerShell**

```powershell
py -3.12 --version
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m pip check
```

第一条应显示 `Python 3.12.x`，最后一条应显示 `No broken requirements found.`。安装途中有报错时，先处理该错误，再继续下一步。Windows 后续都直接使用虚拟环境里的 Python，命令形式为 `.\.venv\Scripts\python.exe`。

### 3. 创建配置文件，填入自己的四项凭据

首次设置时执行下面的命令。如果已经有 `.runtime/cloud.env`，直接编辑现有文件即可。

**macOS / Linux**

```bash
mkdir -p .runtime
cp .env.example .runtime/cloud.env
```

**Windows PowerShell**

```powershell
New-Item -ItemType Directory -Force .runtime
Copy-Item .env.example .runtime\cloud.env
notepad .runtime\cloud.env
```

用 VS Code 等文本编辑器打开 `.runtime/cloud.env`。下面是一个完整配置示例，把四个“填入……”替换成你自己账号里的值，保留等号左边的名称。文件保存为 UTF-8，文件名准确为 `cloud.env`。Windows 可打开资源管理器的“文件扩展名”显示，检查实际名称。

```dotenv
# 以下四项必须填写自己的值
DASHSCOPE_API_KEY=填入你的百炼API密钥
BAILIAN_WORKSPACE_ID=填入这把密钥所属的北京业务空间ID
ALIBABA_CLOUD_ACCESS_KEY_ID=填入图片审核服务的AccessKey_ID
ALIBABA_CLOUD_ACCESS_KEY_SECRET=填入对应的AccessKey_Secret

# 首次使用先保留这两个默认值
QWEN_VISION_MODEL=qwen3-vl-plus
QWEN_IMAGE_MODEL=qwen-image-3.0
```

| 要填的项目 | 获取位置和用途 |
| --- | --- |
| `DASHSCOPE_API_KEY` | 在自己的阿里云百炼账号中创建 API Key，供理解、识图与生成调用使用 |
| `BAILIAN_WORKSPACE_ID` | 百炼账号中与该 Key 对应的北京地域业务空间 ID |
| `ALIBABA_CLOUD_ACCESS_KEY_ID` | 在阿里云 RAM 中取得获准调用图片审核服务的 AccessKey ID，并开通图片审核增强版 |
| `ALIBABA_CLOUD_ACCESS_KEY_SECRET` | 与上一项配对的 AccessKey Secret |

百炼 API Key 和 RAM AccessKey 是两组不同用途的凭据，需分别填写。默认模型名称来自项目实现，账号中需要具备对应模型的权限和额度。更换模型时应确认新模型支持当前的双图编辑或多模态对话协议。

`.runtime/` 已由 Git 忽略。密钥保存在此目录，由本机后端读取。分享项目时保留 `.env.example` 中的空白凭据。修改配置后需要重启服务；若终端还设置过同名环境变量，程序会优先使用终端环境变量。

配置完成后的文件位置应如下。以点开头的目录或文件可能被文件管理器隐藏，可以用编辑器的文件列表查看。

```text
tryon-buddy/                 ← 项目根目录，ZIP 解压后也可能叫 tryon-buddy-main
├── serve_demo.py            ← 启动程序
├── requirements.txt        ← 安装依赖用的清单
├── .env.example            ← 仓库提供的空白配置模板
├── .runtime/
│   └── cloud.env           ← 你填写凭据的文件
├── .venv/                  ← 上一步创建的 Python 环境
├── dist/                   ← 完整工作台页面
└── docs/
    └── index.html          ← 可直接分享的展示页
```

### 4. 启动服务，打开工作台

**macOS / Linux**

```bash
source .venv/bin/activate
python serve_demo.py
```

**Windows PowerShell**

```powershell
.\.venv\Scripts\python.exe serve_demo.py
```

看到 `Demo running at http://127.0.0.1:18793` 后，保持这个终端窗口开着，在同一台电脑的浏览器中打开 [本机首页](http://127.0.0.1:18793/collections/)，再点击「试穿对话」。也可以直接打开 [本机工作台](http://127.0.0.1:18793/#styling)。

按 Ctrl+C 停止服务。下次使用时，在项目根目录重新执行本步骤的启动命令即可。这里的 `127.0.0.1` 指当前电脑；手机里打开该地址会指向手机自身。

### 5. 分三步验证是否配置成功

**先验证程序能启动。** 打开 [健康状态页面](http://127.0.0.1:18793/api/health)，其中应包含下列字段。

```json
{
  "tryOn": true,
  "model": "qwen-image-3.0",
  "inference": "cloud-only"
}
```

实际页面还会显示其他字段。`tryOn: true` 表示需要的配置项都有值，包括错误填写的值也可能使其为 true。服务权限、额度和模型是否可调用，需要通过实际上传与生成验证。

**再验证本地接口。** 保持服务窗口开着，另开一个终端，进入同一个项目根目录，执行对应系统的命令。

macOS / Linux：

```bash
source .venv/bin/activate
python -m unittest discover -s tests -v
```

Windows PowerShell：

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s tests -v
```

看到结尾的 `OK` 表示回归测试通过。测试使用本地替代服务，覆盖上传、规划、任务处理、图片返回和审核恢复。

**最后验证自己的云端账号。** 这一步会调用你配置的第三方服务并产生相应费用。进入工作台，点击「添加本人照」上传一张适合试穿的照片，再点击「传衣服图」上传单件上衣图，按对话提示完成生成。看到实际试穿结果后，再尝试输入「换一件蓝色衬衫」验证文字规划和搜衣。若失败，记录页面提示，按下方排错表处理。

## 完整示例：把模型放进自己的适配文件

上面的默认方式只需填写凭据即可运行。如果你还想练习如何加载自己的模型文件，可以继续这个示例。示例复用项目已有的百炼调用，实现与上面相同的完整功能。

### 1. 创建 `my_models.py`

在**项目根目录**新建一个纯文本文件 `my_models.py`，与 `serve_demo.py` 放在同一层，把下面的代码完整复制进去并保存。保持 `.py` 扩展名，使用 UTF-8 编码。

```python
"""我的模型适配模块：使用项目已有的百炼实现。"""

from aliyun_services import (
    CloudError,
    configured,
    garment,
    image_model,
    moderate,
    plan,
    portrait_output_size,
    try_on,
)

# 在健康状态页面显示当前使用云端服务
INFERENCE_MODE = "cloud"
```

这份文件已经提供了后端所需的全部接口。它把实际请求交给仓库已有的 `aliyun_services.py`，继续使用你在 `cloud.env` 填写的账号和模型配置。

### 2. 告诉程序使用这个文件

编辑 **`.runtime/cloud.env`**，保留上面的四项凭据和两个模型名称，在末尾单独加一行。

```dotenv
TRYON_PROVIDER_MODULE=my_models
```

这里填 Python 模块名称 `my_models`，省略 `.py` 后缀。对应文件布局如下。

```text
tryon-buddy/
├── serve_demo.py
├── my_models.py            ← 刚复制的完整示例
├── aliyun_services.py      ← 示例调用的现有实现
└── .runtime/
    └── cloud.env           ← 加入 TRYON_PROVIDER_MODULE=my_models
```

### 3. 重启并检查模块是否加载

在服务窗口按 Ctrl+C，然后按前面第 4 步重新启动。再次打开健康状态页面，`inference` 应变成 `"cloud"`，模型名称仍与配置一致。

也可以在项目根目录单独运行检查命令。macOS / Linux 先激活虚拟环境后执行：

```bash
python -c "from model_provider import cloud; print(cloud.__name__); print(cloud.configured()); print(cloud.image_model())"
```

Windows PowerShell：

```powershell
.\.venv\Scripts\python.exe -c "from model_provider import cloud; print(cloud.__name__); print(cloud.configured()); print(cloud.image_model())"
```

填写了四项配置时，预期输出为：

```text
my_models
True
qwen-image-3.0
```

这条检查命令只检查加载与配置状态。真实调用仍按前面的上传和生成步骤验证。恢复默认实现时，删除 `cloud.env` 中的 `TRYON_PROVIDER_MODULE` 一行，再重启即可。

### 4. 后续接入其他厂商或本地模型

熟悉模块加载后，可在 `my_models.py` 中用新服务的调用替换相应函数。例如只更换试穿生成时，从上面的导入列表中移除 `try_on`，再按同名函数的参数与 WebP 返回格式实现它，同时更新 `configured()` 和 `image_model()` 来检查新配置及显示新模型。

保留使用的理解、识图和审核函数仍需对应服务的凭据。若要全部迁移，应实现全部接口，并安装新服务所需的依赖。不同服务的图片上传、生成接口和返回结构会有差异，具体实现按 [完整接口契约](docs/model-integration.md) 与所选服务文档对接。

## 常见问题

| 看到的情况 | 下一步检查 |
| --- | --- |
| 找不到 `python3.12` 或 `py` | 确认已安装 Python 3.12，重新打开终端，再运行版本检查命令 |
| 找不到 `requirements.txt` 或 `serve_demo.py` | 当前终端目录应是包含这两个文件的项目根目录，先用 `cd` 切换 |
| 提示缺少 `requests`、`dotenv` 等模块 | 用上面创建的 `.venv` 安装并启动，确认安装依赖步骤成功结束 |
| 健康页面里 `tryOn` 是 false | 默认实现检查四项凭据是否都已填写，文件是否准确位于 `.runtime/cloud.env`；修改后重启 |
| `tryOn` 是 true，但上传或生成失败 | 看页面具体报错，检查账号权限、额度、地域、业务空间及网络；该字段只表示配置项有值 |
| 提示无法加载 `my_models` | 确认 `my_models.py` 与 `serve_demo.py` 同层，配置值为 `my_models`；若模块还导入了额外 SDK，需先安装 |
| 提示适配模块缺少接口 | 对照示例保留全部必需函数和 `CloudError`，或检查自己实现的函数名 |
| 提示图片审核不可用 | 检查审核服务是否开通、RAM 权限及两项 AccessKey 是否配对；上传和成图都会经过审核 |
| 提示端口已占用 | 先停止之前启动的服务；或执行 `python serve_demo.py --port 18794`，浏览器地址也改用 18794（Windows 使用虚拟环境 Python 路径） |
| 在线展示页能看，真实生成无法使用 | 启动完整后端并打开本机工作台；GitHub Pages 上的展示页用于浏览与交互展示 |

## 模型与后端流程

浏览器将本人照、衣物和文字需求提交给 Python 后端。后端完成图片格式检查与审核，调用理解模型生成搭配动作，用图片搜索取得衣物候选并核验，创建生成任务，依次编辑选中的单品，审核结果后返回浏览器保存。

模型由 `model_provider.py` 加载，默认调用集中在 `aliyun_services.py`。使用现有百炼接口时填写自己的凭据即可；更换同协议模型时配置模型名称；使用其他厂商或本地模型时，按 [接入文档中的函数契约](docs/model-integration.md) 实现对应调用。

| 文件或目录 | 职责 |
| --- | --- |
| `dist/` | 响应式页面、对话、衣柜、记录、备选与示例素材 |
| `serve_demo.py` | 静态服务、HTTP API、搜衣、任务队列、审核恢复 |
| `model_provider.py` | 选择并检查默认或自定义模型适配模块 |
| `aliyun_services.py` | 理解、识图、图片生成、云端审核适配 |
| `image_policy.py` | 图片与文字检查、审核缓存 |
| `提示词/` | 上传规则与试穿约束 |
| `tests/` | 审核恢复、并发及配置回归测试 |
| `docs/index.html` | 可独立分享的完整展示页 |
| `.env.example` | 空白凭据及可选模型配置 |

## 当前范围

- 已实现首页、试穿对话、服装上传、搜衣、连续替换单品、案例查看、记录与备选。
- 登录使用本机演示账号，记录保存在浏览器中，跨设备账号同步和服务端用户隔离需要部署者继续实现。
- 任务队列使用后端内存，输入审核缓存存入 `.runtime/`，进程重启会结束未完成的任务。
- 原始流程图覆盖更完整的产品目标，批量任务、手动框选及部分比较流程仍需进一步开发与验收。
- 默认服务监听 `127.0.0.1`，适合本机使用。面向公网提供真实生成时，需要补齐身份验证、任务归属和额度管理。
- 在线演示托管在 GitHub Pages。真实试穿运行 Python 后端，云端调用费用由配置密钥的使用者承担。本人照、衣物和成图会按流程提交给所接服务。

## 验证

```bash
python -m unittest discover -s tests -v
```

回归测试使用替代服务验证队列和恢复行为，并启动临时本机 HTTP 服务检查自定义模型的完整接入链路。真实成图质量、延迟及费用需用自己的模型配置另行验证。

## 开源协议

本项目采用 [MIT License](LICENSE)，允许使用、修改、分发和商业使用，分发时保留版权和许可声明。外部模型服务与运行时搜索取得的商品图片适用各自的服务条款和权利要求。
