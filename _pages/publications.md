---
layout: archive
title: "Publications"
permalink: /publications/
author_profile: false
---

{% if site.author.googlescholar %}
  <div class="wordwrap">You can also find my articles on <a href="{{site.author.googlescholar}}">my Google Scholar profile</a>.</div>
{% endif %}

{% include base_path %}

{% for post in site.publications reversed %}
  {% include archive-single.html %}
{% endfor %}

📄 SpaLLM: Unified Compressive Adaptation of Large Language Models with Sketching \
Tianyi Zhang, **Junda Su**, Oscar Wu, Zhaozhuo Xu, Anshumali Shrivastava \
*In submission to ICLR'2025* \
[paper](https://arxiv.org/abs/2410.06364)

📄 In Defense of Structural Sparse Adapters for Concurrent LLM Serving \
**Junda Su**, Zirui Liu, Zeju Qiu, Weiyang Liu, Zhaozhuo Xu. \
*Accepted in EMNLP’2024 Findings. Accepted in ES-FOMO (workshop) at ICML’24*  \
[paper](https://openreview.net/forum?id=XmkNjekAOm&noteId=XmkNjekAOm) [poster](https://docs.google.com/presentation/d/1lCfdgmzniGZnQUqzfxjlnWs5GLfbjAf0x6J-sbWrs-I/edit)

📄 Hierarchical Deep Learning for Autonomous Multilabel Arrhythmia Detection and Classiﬁcation on Real-world Wearable ECG Data \
Guangyao Zheng, Sunghan Lee, Jeonghwan Koh, Khushbu Pahwa, Haoran Li, Zicheng Xu, Haiming Sun, **Junda Su**, Sung Pil Cho, Sung Il Im, In cheol Jeong, Vladimir Braverman \
*Accepted in Digital Health*
