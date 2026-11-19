# 接入自己的模型

## 使用默认实现

复制根目录的 `.env.example` 到 `.runtime/cloud.env`，填写自己的百炼和阿里云图片审核凭据，安装依赖后运行 `python serve_demo.py`。账号中的模型权限、业务空间和额度需要对应。无需将密钥写进前端或分享用的 HTML。

理解和识图共用 `QWEN_VISION_MODEL`，默认是 `qwen3-vl-plus`。图片编辑使用 `QWEN_IMAGE_MODEL`，默认是 `qwen-image-3.0`。省略或留空这两项会沿用默认值。更换名称后，新模型需要支持实现中使用的输入、输出与参数协议。

默认理解接口是北京业务空间下的 `compatible-mode/v1/chat/completions`，生成接口是 `api/v1/services/aigc/multimodal-generation/generation`。图片审核走上海区域的阿里云图片审核增强版。

## 更换厂商或接入本地模型

后端的 `serve_demo.py` 和 `image_policy.py` 都通过 `aliyun_services.py` 调用模型。可以在该文件中替换服务实现，保持下列函数签名和返回值，也可以把函数委托给自己的适配模块。更换厂商需要适配该服务的请求与响应协议。

| 函数 | 输入 | 返回 |
| --- | --- | --- |
| `plan(context)` | 包含 query、context、preferences、pieces 等的字典 | 字典，action 为 new、replace、again 或 clarify；kind 为 top、bottom 或 null；query 或 clarification 为非空字符串 |
| `garment(data, criteria=None)` | 图片字节、可选的款式与颜色约束 | 字典，kind 为 top、bottom 或 unknown；photoType 为 flat-lay、model 或 unknown；category 为 top、pants、skirt 或 unknown；有约束时提供 matched 布尔值及 titleColors 列表 |
| `moderate(jpeg)` | 待检查的图片字节 | none、low、medium 或 high 之一，现有规则据风险等级决定是否继续 |
| `portrait_output_size(width, height)` | 人物原图宽高 | 下游生成器理解的尺寸字符串，默认形如 `832*660` |
| `try_on(person, garment_data, category, photo_type, request_text, size)` | 人物图片字节、衣物图片字节、tops 或 bottoms、图片类别、穿着要求和尺寸 | Pillow 可读取的生成图片字节，现有实现返回 WebP |
| `configured()` | 无 | 是否已配置当前适配实现所需凭据的布尔值，用于健康接口展示 |
| `image_model()` | 无 | 当前生成模型名称，用于健康接口展示 |

错误用 `CloudError` 抛出，信息应可展示给用户。不要把密钥、供应商完整请求或凭据响应拼进异常信息。审核服务异常应抛错，保留当前流程的重试语义。

### 图像生成适配要点

1. 传入人物原图与目标衣物两张图，结合 `category` 限定替换部位。
2. 保留人物身份、姿态、场景、取景和未指定替换的衣物。根据原图尺寸选择新模型支持的输出画幅。
3. 将供应商返回的图片地址或 Base64 解码为图片字节再返回。默认实现对输出大小有限制并转为 WebP。
4. 多件衣物由调用方按顺序编辑，后一件接收前一步的结果，适配函数每次负责一件。
5. 接收生成超时或不确定响应时，避免无条件重新发起计费生成。已有成图只因审核失败时，任务模块会走审核恢复。
6. 替换 `configured()` 与 `image_model()`，让 `/api/health` 反映新服务的配置与模型名称。该接口报告配置状态，实际可调用性需要请求服务验证。

### 理解与识图适配要点

`plan` 返回结构化动作，用于决定换哪件、搜索什么或向用户补问。原实现的 `qwen` 辅助函数负责 JSON 响应解析，可以在其中接入支持文字和图片的兼容接口。若分别使用文字模型与视觉模型，也可以直接分别实现 `plan` 和 `garment`。

`garment` 会用于上传衣物分类及搜索候选核验。只有候选满足目标类别、颜色及排除条件时才应返回 `matched=true`，避免把搜索标题直接当作图片内容。

## 接入后验证

先运行 `python -m unittest discover -s tests -v`，再用自己的配置实际测试人物照上传、衣服图上传、文字搜衣、单件生成、保留单品继续换装和审核失败恢复。回归测试替代了付费服务，不能证明新厂商端到端可用。
