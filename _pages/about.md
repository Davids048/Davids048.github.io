---
permalink: /
title: "ABOUT ME"
author_profile: true
redirect_from: 
  - /about/
  - /about.html
---
I am an undergradute student at Rice University studying computer science. I’m applying for Master Programs and Ph.D. programs in the Fall 2024 cycle. 

My research interests lie at the intersection of efficient ML and systems. I am interested in developing efficient LLM algorithms, as well as hardware-aware systems that speed up these architectures. 

My last project focused on developing a concurrent LLM adapter serving system tailored for structural sparse BOFT adapters, achieving a 2.12x speedup over S-LoRA when serving 96 adapters using a single NVIDIA A100 GPU. We developed a unified matrix multiplication operation that enabled efficient adapter batching using Triton kernels. Our paper is accepted in ES-FOMO at ICML'24 and in submission to EMNLP'2024. Currently, I'm working on integrating a newly developed 2-bit quantization scheme (KIVI) into TensorRT-LLM.
