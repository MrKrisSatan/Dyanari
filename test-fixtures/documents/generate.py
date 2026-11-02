"""Reproduce non-private acceptance fixtures with independent document writers.
Requires python-docx, openpyxl and reportlab; not used by the application.
"""
from pathlib import Path
from docx import Document
from openpyxl import Workbook
from reportlab.pdfgen import canvas

root = Path(__file__).parent
doc = Document()
doc.add_heading('Dyanari document acceptance', 0)
doc.add_paragraph('Unicode: café and £42. Rich text paragraph.')
table = doc.add_table(rows=2, cols=2)
table.cell(0, 0).text = 'Item'
table.cell(0, 1).text = 'Value'
table.cell(1, 0).text = 'Answer'
table.cell(1, 1).text = '42'
doc.save(root / 'example.docx')
book = Workbook()
sheet = book.active
sheet.title = 'Summary'
sheet.append(['Dyanari document acceptance', 42])
sheet.append(['café', '=SUM(17,25)'])
book.create_sheet('Hidden').sheet_state = 'hidden'
book.save(root / 'example.xlsx')
pdf = canvas.Canvas(str(root / 'example.pdf'), invariant=1)
pdf.drawString(72, 750, 'Dyanari document acceptance')
pdf.drawString(72, 720, 'Answer: 42')
pdf.showPage()
pdf.drawString(72, 750, 'Second page: local text extraction')
pdf.save()
