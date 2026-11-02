"""Dyanari's scoped adapter: keep the quantized text encoder on system RAM.

The upstream GGUF loader still reads/validates all model data. This adapter
changes only the execution/offload device; the diffusion model uses the GPU.
"""
import torch
import nodes


class DyanariQwenCLIPLoader:
    @classmethod
    def INPUT_TYPES(cls):
        return nodes.NODE_CLASS_MAPPINGS["CLIPLoaderGGUF"].INPUT_TYPES()

    RETURN_TYPES = ("CLIP",)
    FUNCTION = "load"
    CATEGORY = "Dyanari"

    def load(self, clip_name, type="qwen_image"):
        clip = nodes.NODE_CLASS_MAPPINGS["CLIPLoaderGGUF"]().load_clip(clip_name, type)[0]
        device = torch.device("cpu")
        clip.load_device = device
        clip.offload_device = device
        clip.patcher.load_device = device
        clip.patcher.offload_device = device
        return (clip,)


NODE_CLASS_MAPPINGS = {"DyanariQwenCLIPLoader": DyanariQwenCLIPLoader}
