import os
import sys
from PIL import Image, ImageDraw

def flood_fill_transparent(img_path, output_path):
    print(f"[1/3] 투명화 가공을 위해 원본 이미지 로드 중: {img_path}")
    img = Image.open(img_path).convert("RGBA")
    width, height = img.size
    data = img.load()
    
    # 4개 귀퉁이에서 시작하는 BFS 플러드필 구현
    visited = [[False for _ in range(height)] for _ in range(width)]
    
    # BFS 시작 지점 (네 모서리와 테두리 가장자리 시작점들)
    queue = []
    
    # 테두리 가장자리 픽셀들을 초기 큐에 추가
    for x in range(width):
        queue.append((x, 0))
        queue.append((x, height - 1))
    for y in range(height):
        queue.append((0, y))
        queue.append((width - 1, y))
        
    print("[2/3] 가장자리 흰색 불투명 배경 감지 및 플러드필 투명화 진행 중...")
    count = 0
    while queue:
        x, y = queue.pop(0)
        if x < 0 or x >= width or y < 0 or y >= height:
            continue
        if visited[x][y]:
            continue
        visited[x][y] = True
        
        r, g, b, a = data[x, y]
        
        # 흰색 계열 판별 (RGB가 모두 235 이상이거나 투명도가 아직 있는 경우)
        # 둥근 사각형 파란색 영역(RGB=10, 100, 240 계열)은 완전히 보호됩니다.
        if r > 235 and g > 235 and b > 235:
            # 투명화 처리
            data[x, y] = (r, g, b, 0)
            count += 1
            
            # 상하좌우 및 대각선(8방향) 탐색하여 퍼져나감
            for dx in [-1, 0, 1]:
                for dy in [-1, 0, 1]:
                    if dx == 0 and dy == 0:
                        continue
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < width and 0 <= ny < height:
                        if not visited[nx][ny]:
                            queue.append((nx, ny))
                            
    print(f"[OK] 총 {count}개의 외곽 불투명 픽셀이 성공적으로 투명화되었습니다.")
    img.save(output_path, "PNG")
    print(f"[OK] 투명 배경 PNG 임시 저장 완료: {output_path}")
    return img

def make_ico(png_img, ico_path):
    # electron-builder 최소 256x256 요구 규격을 충족하기 위해 내림차순(256 -> 16)으로 빌드
    sizes = [256, 128, 64, 48, 32, 16]
    images = []
    
    for size in sizes:
        # Lanczos 필터로 화질 손실 없이 리사이징
        resized = png_img.resize((size, size), Image.Resampling.LANCZOS)
        images.append(resized)
        
    # 다중 해상도가 뭉쳐진 단일 .ico 파일 저장
    images[0].save(ico_path, format="ICO", sizes=[(s, s) for s in sizes], append_images=images[1:])
    print(f"[OK] 다중 해상도 윈도우용 ICO 생성 완료: {ico_path}")

def main():
    # 경로 설정
    conversation_brain_dir = r"C:\Users\CEO\.gemini\antigravity\brain\d06f31a6-15e5-434c-842c-3143f4bd49a2"
    source_png = os.path.join(conversation_brain_dir, "app_icon_squircle_1779951071955.png")
    
    current_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(current_dir)
    homepage_root = os.path.abspath(os.path.join(project_root, "..", "ez-hub-homepage"))
    
    temp_transparent_png = os.path.join(conversation_brain_dir, "app_icon_transparent.png")
    
    if not os.path.exists(source_png):
        print(f"[에러] 원본 소스 이미지를 찾을 수 없습니다: {source_png}")
        sys.exit(1)
        
    # 1. 외곽 흰색 플러드필 투명화 가공
    transparent_img = flood_fill_transparent(source_png, temp_transparent_png)
    
    # 2. 다중 타겟 경로에 정밀 배치
    targets = [
        # EzPrintWork public
        {"type": "png", "path": os.path.join(project_root, "public", "icon.png"), "size": 512},
        {"type": "png", "path": os.path.join(project_root, "public", "favicon.png"), "size": 32},
        {"type": "ico", "path": os.path.join(project_root, "public", "icon.ico")},
        {"type": "ico", "path": os.path.join(project_root, "public", "favicon.ico")},
        
        # ez-hub-homepage public
        {"type": "png", "path": os.path.join(homepage_root, "public", "favicon.png"), "size": 32},
        {"type": "ico", "path": os.path.join(homepage_root, "public", "favicon.ico")}
    ]
    
    print("\n[3/3] 최종 타겟 자산 디렉토리로 컴파일 이식 중...")
    for target in targets:
        target_path = target["path"]
        # 폴더가 없으면 생성
        os.makedirs(os.path.dirname(target_path), exist_ok=True)
        
        if target["type"] == "png":
            size = target["size"]
            resized_png = transparent_img.resize((size, size), Image.Resampling.LANCZOS)
            resized_png.save(target_path, "PNG")
            print(f"[OK] PNG 복사 완료 ({size}x{size}): {target_path}")
        elif target["type"] == "ico":
            make_ico(transparent_img, target_path)
            
    print("\n[SUCCESS] 모든 아이콘의 외곽 흰색 테두리 상자가 완전히 제거되고 아름답게 투명화되었습니다!")

if __name__ == "__main__":
    main()
