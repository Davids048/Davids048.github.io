---
title: CUDA by Examples Study Notes
date: 2024-06-24
permalink: /posts/2024/06/CUDA-by-Examples-Study-Notes
tags: []
---


##### Introduction
##### Chapter 3
CUDA is a platform for running GPU code. So one big perk of CUDA is to use syntax similar to that used for CPU programming to write GPU code. In order to do that, CUDA C introduced some key words in addition to the standard C. 

Some of the keywords are used to distinguish code that runs on **device** and **host**. (host is the CPU, device is the GPU). I like to think of the host (CPU) as the manager/orchestrater, and it "tells" the device (GPU) what to do.

- `__global__ void kernel(args)` : This qualifier alerts the compiler that a function should be compiled on device, not host.
- `kernel<<<m,n>>>(arg1, arg2)`: This is how a GPU kernel is called. The `m` and `n` in the angle brackets are args that affect the launch, `arg1, arg2` are the actual arguments fed to the kernel function.
<br>
- To do anything useful on the GPU, we need to allocate the required memory on GPU first:
	- `cudaMalloc((void**)dev_ptr, size)`: `cudaMalloc` is similar to the standard C `malloc` function,  but instead of returning a pointer, it takes a *pointer to a device pointer*, and returns an error code. 

		Why is cudaMalloc designed like this? This is because in C, when we need to modify the value of an input argument in place, we need to pass in a reference to that argument. ([See this post](https://stackoverflow.com/questions/12936986/why-does-cudamalloc-use-pointer-to-pointer))

		NOTE: remember to always check the returned error code from cudaMalloc (and any other functions that returns error code). Seems like a good practice.
	-  Some rules to remember:
		1. Do not dereference the device pointer returned by `cudaMalloc` from code that executes on the host.
		2. device pointers can be passed around in host code, but they cannot be accessed to read/write memory on the host. 
	- In order to free a cudaMalloced pointer, use `cudaFree(ptr)`

- some other common methods:
	- [`cudaMemcpy`](https://docs.nvidia.com/cuda/cuda-runtime-api/group__CUDART__MEMORY.html#group__CUDART__MEMORY_1gc263dbe6574220cc776b45438fc351e8)
	- [`cudaGetDeviceCount`]()
	- [`cudaDeviceProp`](): a struct containing device info
	- [`cudaChooseDevice()`]()
	- 
##### Chapter 4
Parallel programming in CUDA
- Lets go back to the kernel launch call: `kernel<<<m, n>>>(arg1, arg2...)`
	- Here, `m` means the number of parallel blocks in which we would like the device to execute the kernel.
	- Inside the kernel, in order to distinguish different kernel copies:
		- `blockIdx`: This is defined in CUDA runtime, telling us which block that kernel copy is. It is a `uint3` variable. So we can access `blockIdx.x`, and `blockIdx.y`for indexing the copies. 
	- `m` can also be a grid, instead of a number:
		```
		dim3 grid(DIM,DIM); 
		kernel<<<grid,1>>>( dev_bitmap );
		```
		- The `dim3` type grid allows us to specify a 2D launch grid. The third dimension is inferred to 1 because CUDA might support 3D launch grid in the future.
<br>
- Sometimes, we can see CUDA code that uses offsets:
		![[Pasted image 20240622111530.png]]
	But if the grid is 2D, why would we use one number as the offset?
	Turns out CUDA sometimes use a ***linear offset*** to access memory in pointers. This give us a unique index into ptr that range from 0 to `m*n -1 `
- For a function that runs on the device (not the kernel), we can use:
	- `__device__` signature to indicate the code will run on GPU. These function can only be run on functions defined with `__device__` or `__global__`. 
	- 


##### Some useful links:
- [CUDA C programming guide](https://docs.nvidia.com/cuda/cuda-c-programming-guide/)

