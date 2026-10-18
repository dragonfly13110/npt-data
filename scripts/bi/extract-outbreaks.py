"""Read reported national totals from DOAE PDFs; never allocate totals to provinces."""
import json
import re
import sys
from pathlib import Path
from pypdf import PdfReader

MONTHS = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม']


def parse_summary(text, rice=False):
    text = re.split(r'\n\s*3\.(?:\s|\d)', text, maxsplit=1)[0]
    text = re.sub(r'(?m)^(\s*2\.\d+\.)\s+(\d+)', r'\1\2', text)
    headings = dict(re.findall(r'^\s*2\.(\d+)\s+ศัตรู([^\n]+)', text, re.M))
    pattern = r'^\s*(2\.\d+(?:\.\d+)?)\s+([^\n]+)'
    sections = [m for m in re.finditer(pattern, text, re.M) if rice or m[1].count('.') == 2 or not m[2].strip().startswith('ศัตรู')]
    result = []
    for i, match in enumerate(sections):
        block = text[match.start():sections[i + 1].start() if i + 1 < len(sections) else len(text)]
        # Stop before recommendations and charts, which can repeat the same numbers.
        block = re.split(r'\n\s*3\.\s', block)[0]
        compact = re.sub(r'\s+', '', block).replace('\u0e4d\u0e32', 'ำ')
        amount = re.search(r'(?:รวม)?จำนวน([\d,]+(?:\.\d+)?)ไร่', compact)
        if not amount:
            raise ValueError('No unambiguous reported area in section ' + match[1])
        provinces = re.search(r'(\d+)จังหวัด', compact[:amount.start()])
        past = re.search(r'(?:ที่ผ่านมา|ที่ผ่ำนมำ)([\d,]+(?:\.\d+)?)ไร่', compact)
        pest = re.split(r'พบ|พื้นที่', match[2], maxsplit=1)[0]
        pest = re.sub(r'\s+', '', pest).replace('\u0e4d\u0e32', 'ำ')
        crop = 'ข้าว' if rice else re.sub(r'\s+', '', headings.get(match[1].split('.')[1], '')).replace('\u0e4d\u0e32', 'ำ')
        if not rice and match[1].count('.') == 1:
            detail = re.match(r'(.+?)พบ.+?ของ\s*(.+?)(?:พื้นที่|พบ)', match[2])
            if not detail:
                raise ValueError('Unrecognized flat crop/pest section ' + match[1])
            crop = re.sub(r'\s+', '', detail[1])
            pest = re.sub(r'\s+', '', detail[2])
        if not crop or not pest or len(pest) > 100:
            raise ValueError('Unrecognized crop/pest heading')
        result.append({
            'source_section': match[1], 'crop': crop, 'pest_name': pest,
            'reported_area_rai': float(amount[1].replace(',', '')),
            'previous_area_rai': float(past[1].replace(',', '')) if past else None,
            'reported_province_count': int(provinces[1]) if provinces else None,
            'npt_mention': 'ระบุชื่อนครปฐมในหัวข้อนี้' if 'นครปฐม' in compact[:amount.start()] else 'ไม่พบชื่อในหัวข้อที่อ่าน ไม่ยืนยันว่าไม่มีการระบาด',
        })
    if not result:
        raise ValueError('No readable outbreak summary; retain previous snapshot')
    # Some official PDFs repeat a section number for different pests; keep the printed number.
    if len({(r['crop'], r['pest_name']) for r in result}) != len(result):
        raise ValueError('Duplicate crop/pest rows')
    return result


if __name__ == '__main__':
    if sys.argv[1:] == ['--check']:
        row = parse_summary('2.1 เพลี้ยไฟ พื้นที่ระบาด 2 จังหวัด ได้แก่ นครปฐม รวมจำนวน 120.50 ไร่ (สัปดาห์ที่ผ่านมา 100.00 ไร่)\n3. การควบคุม', rice=True)[0]
        assert row['reported_area_rai'] == 120.5 and row['previous_area_rai'] == 100
        assert row['reported_province_count'] == 2 and row['npt_mention'].startswith('ระบุชื่อ')
        print('Outbreak parser checks passed')
    else:
        jobs = json.loads(Path(sys.argv[1]).read_text(encoding='utf-8'))
        output = []
        for job in jobs:
            reader = PdfReader(job['file'])
            if len(reader.pages) > 40:
                raise ValueError('Unexpectedly large report')
            text = '\n'.join(page.extract_text() or '' for page in reader.pages)
            year, month, day = map(int, job['report_date'].split('-'))
            # Thai legacy PDF fonts can extract า as ำ; normalize only for date comparison.
            date_text = re.sub(r'\s+', '', text).replace('ำ', 'า')
            expected = f'วันที่0?{day}{MONTHS[month-1]}{year+543}'
            if not re.search(expected, date_text):
                raise ValueError('PDF date does not match the official article title')
            rows = parse_summary(text, rice=job['group_id'] == 10)
            for row in rows:
                output.append({**row, 'report_id': str(job['report_id'])})
        print(json.dumps(output, ensure_ascii=True))
