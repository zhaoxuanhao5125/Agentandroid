# 光学图形源文件

`render-optic.py` 生成应用所用的静态棱镜和 15 个视角组成的运动图集。它是开发工具，不安装在手机上；程序在运行时不下载素材，也不使用摄像头。安装 Python 3、NumPy、Numba 和 Pillow 后，在仓库根目录运行：

```sh
python3 tools/art/render-optic.py app/src/main/assets/ui poster
python3 tools/art/render-optic.py app/src/main/assets/ui frames
```

图集固定为 5 × 3 帧；更改帧数或单帧大小时应同步更新 `optic.js`。三角形的距离函数使用等边三角形的对称折叠关系，参见 [Inigo Quilez 的 2D distance functions](https://iquilezles.org/articles/distfunctions2d/)；应用的复合几何、材质、棚灯与构图均在本仓库的脚本中定义。
