import re
import json
import os
import sys
import geopandas as gpd
from pathlib import Path

def resolve_path(base_dir, path):
    """将可能相对路径转换为绝对路径（相对于 .wor 文件所在目录）"""
    if os.path.isabs(path):
        return path
    return os.path.normpath(os.path.join(base_dir, path))

def mif_to_geojson(tab_path, output_dir):
    """将 MIF 文件转换为 GeoJSON，保留所有字段"""
    base, ext = os.path.splitext(tab_path)
    mif_path = base + '.mif'
    if not os.path.exists(mif_path):
        print(f"警告：找不到对应的 MIF 文件 {mif_path}")
        return None
    print(f"使用 MIF 文件: {mif_path}")

    try:
        # 直接用 geopandas 读取 MIF 文件
        gdf = gpd.read_file(mif_path)
    except Exception as e:
        print(f"读取 {mif_path} 失败: {e}")
        import traceback
        traceback.print_exc()
        return None

    # 确保坐标系为 WGS84 (EPSG:4326)
    if gdf.crs is None:
        pass
    elif gdf.crs.to_epsg() != 4326:
        gdf = gdf.to_crs('EPSG:4326')

    # 生成输出文件名
    base_name = Path(tab_path).stem
    output_path = os.path.join(output_dir, f"{base_name}.geojson")
    gdf.to_file(output_path, driver='GeoJSON', encoding='utf-8')
    print(f"已转换: {output_path}")
    return output_path

def parse_wor(wor_path, output_dir=None):
    with open(wor_path, 'r', encoding='gbk', errors='ignore') as f:
        content = f.read()

    base_dir = os.path.dirname(wor_path)
    if output_dir is None:
        output_dir = os.path.join(base_dir, 'geojson')
    os.makedirs(output_dir, exist_ok=True)

    # 1. 解析 Open Table 语句
    open_table_pattern = re.compile(r'Open Table "(.*?)" As (\w+)')
    table_aliases = {}
    for match in open_table_pattern.finditer(content):
        path = match.group(1)
        alias = match.group(2)
        if not path.lower().endswith('.tab'):
            path += '.tab'
        full_path = resolve_path(base_dir, path)
        table_aliases[alias] = full_path

    # 2. 解析 Map From 语句，获取图层顺序
    map_from_pattern = re.compile(r'Map From ([\w, ]+)')
    map_from_match = map_from_pattern.search(content)
    if not map_from_match:
        raise ValueError("未找到 Map From 语句")
    layer_aliases = [name.strip() for name in map_from_match.group(1).split(',')]

    # 3. 解析地图中心点和 Zoom
    center_pattern = re.compile(r'Center\s*\(([\d\.\-]+),([\d\.\-]+)\)')
    zoom_pattern = re.compile(r'Zoom\s*([\d\.]+)\s*Units\s*"(\w+)"')
    center_match = center_pattern.search(content)
    zoom_match = zoom_pattern.search(content)
    if not center_match or not zoom_match:
        raise ValueError("未找到地图中心点或缩放值")
    center_lon = float(center_match.group(1))
    center_lat = float(center_match.group(2))
    zoom_val = float(zoom_match.group(1))
    zoom_unit = zoom_match.group(2).lower()
    camera_altitude_km = zoom_val

    # 4. 解析每个 Layer 块
    layer_blocks = re.findall(r'Layer (\d+)\s+(.*?)(?=Layer \d+|Set Window)', content, re.DOTALL)
    layers_info = []
    for layer_num, block in layer_blocks:
        idx = int(layer_num) - 1
        if idx >= len(layer_aliases):
            continue
        alias = layer_aliases[idx]
        tab_path = table_aliases.get(alias, '')

        # 解析样式
        style = {}
        # 点样式
        symbol_match = re.search(r'Symbol\s*\((\d+),(\d+),(\d+),"?([^"]*)"?', block)
        if symbol_match:
            style['point'] = {
                'type': int(symbol_match.group(1)),
                'color': int(symbol_match.group(2)),
                'size': int(symbol_match.group(3)),
                'font': symbol_match.group(4) if symbol_match.group(4) else ''
            }
        # 线样式
        line_match = re.search(r'Line\s*\((\d+),(\d+),(\d+)\)', block)
        if line_match:
            style['line'] = {
                'width': int(line_match.group(1)),
                'color': int(line_match.group(2)),
                'pattern': int(line_match.group(3))
            }
        # 填充样式
        brush_match = re.search(r'Brush\s*\((\d+),(\d+),(\d+)\)', block)
        if brush_match:
            style['fill'] = {
                'pattern': int(brush_match.group(1)),
                'foreground': int(brush_match.group(2)),
                'background': int(brush_match.group(3))
            }

        # 标注字段
        label_match = re.search(r'With\s+(\w+)', block)
        label_field = label_match.group(1) if label_match else ''
        # 链接字段
        link_field = ''
        activate_match = re.search(r'Activate Using (\w+) On Labels Objects', block)
        if activate_match:
            link_field = activate_match.group(1)

        # 转换 MIF 为 GeoJSON
        geojson_path = None
        if tab_path and os.path.exists(tab_path):
            geojson_path = mif_to_geojson(tab_path, output_dir)
            if geojson_path:
                rel_path = os.path.relpath(geojson_path, base_dir)
                geojson_path = rel_path.replace('\\', '/')
        else:
            print(f"警告：未找到表文件 {tab_path}")

        layers_info.append({
            'name': alias,
            'tab_path': tab_path,
            'geojson_path': geojson_path,
            'style': style,
            'label_field': label_field,
            'link_field': link_field
        })

    # 5. 构建最终 JSON
    config = {
        'version': 1,
        'map_center': [center_lon, center_lat],
        'camera_altitude_km': camera_altitude_km,
        'layers': layers_info
    }
    # 输出 JSON 到 data 目录
    data_dir = os.path.join(base_dir, 'data')
    os.makedirs(data_dir, exist_ok=True)
    out_json = os.path.join(data_dir, 'axnode_config.json')
    with open(out_json, 'w', encoding='utf-8') as f:
        json.dump(config, f, ensure_ascii=False, indent=2)
    print(f"成功生成配置文件: {out_json}")
    return config

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("用法: python parse_wor.py <wor文件路径> [输出目录]")
        sys.exit(1)
    wor_file = sys.argv[1]
    output_dir = sys.argv[2] if len(sys.argv) > 2 else None
    try:
        parse_wor(wor_file, output_dir)
    except Exception as e:
        print(f"解析失败: {e}")