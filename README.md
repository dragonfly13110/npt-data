# NPT Data (Static Hosting)

ศูนย์จัดเก็บข้อมูล Static Data และ GeoJSON สำหรับ **Nakhon Pathom Agricultural Dashboard (npt_dashboard)**
ให้บริการผ่าน **GitHub Pages**:
`https://dragonfly13110.github.io/npt-data/`

---

## สารบัญข้อมูล (Endpoints)

### ติดตามพื้นที่ปลูกข้าว (Crop Monitor - Rice)
- **Manifest**: `https://dragonfly13110.github.io/npt-data/data/crop-monitor/rice/manifest.json`
- **รอบปัจจุบัน (Current)**:
  - เมืองนครปฐม: `.../data/crop-monitor/rice/current/7301.json`
  - กำแพงแสน: `.../data/crop-monitor/rice/current/7302.json`
  - นครชัยศรี: `.../data/crop-monitor/rice/current/7303.json`
  - ดอนตูม: `.../data/crop-monitor/rice/current/7304.json`
  - บางเลน: `.../data/crop-monitor/rice/current/7305.json`
  - สามพราน: `.../data/crop-monitor/rice/current/7306.json`
  - พุทธมณฑล: `.../data/crop-monitor/rice/current/7307.json`
- **รูปแปลง (Geometry)**: `.../data/crop-monitor/rice/geometry/<รหัสอำเภอ>.json`
- **รอบประวัติศาสตร์**: `.../data/crop-monitor/rice/<snapshotId>/<รหัสอำเภอ>.json`
