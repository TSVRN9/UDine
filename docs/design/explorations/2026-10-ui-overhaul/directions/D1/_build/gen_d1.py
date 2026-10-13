"""Generates D1HallMenu.dc.html and D1PlateSheet.dc.html (shared menu markup)."""
import os
OUT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

HEAD = '''<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
  <style>
    @import url("https://fonts.googleapis.com/css2?family=Oswald:wght@500;600;700&family=Libre+Franklin:wght@400;500;600;700&display=swap");
    body { margin: 0; font-family: "Libre Franklin", system-ui, sans-serif; background: #3b0a0f; }
  </style>
</helmet>
<div style="width: 390px; height: 844px; overflow: hidden; position: relative; box-sizing: border-box; background: #f8f9fb; color: #24171a;">
'''
TAIL = '''</div>
</x-dc>
</body>
</html>
'''
OSW = "font-family: 'Oswald', sans-serif;"
CHEV_L = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M15 5l-7 7 7 7" style="stroke: #ffffff; stroke-width: 2.2px; stroke-linecap: round; stroke-linejoin: round;"></path></svg>'
SM_L = '<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M9 3L5 7l4 4" style="stroke: #ffffff; stroke-width: 1.8px; stroke-linecap: round; stroke-linejoin: round;"></path></svg>'
SM_R = '<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M5 3l4 4-4 4" style="stroke: #ffffff; stroke-width: 1.8px; stroke-linecap: round; stroke-linejoin: round;"></path></svg>'
INFO = '<svg width="20" height="20" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6.4" style="stroke: rgba(255,255,255,0.85); stroke-width: 1.4px;"></circle><path d="M8 7.4v3.4" style="stroke: rgba(255,255,255,0.85); stroke-width: 1.5px; stroke-linecap: round;"></path><circle cx="8" cy="5" r="0.9" style="fill: rgba(255,255,255,0.85);"></circle></svg>'
BAG = '<svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M3 5h10l-1 9H4L3 5z" style="stroke: rgba(255,255,255,0.72); stroke-width: 1.5px; stroke-linejoin: round;"></path><path d="M5.5 5V4a2.5 2.5 0 0 1 5 0v1" style="stroke: rgba(255,255,255,0.72); stroke-width: 1.5px;"></path></svg>'


def header():
    letter = ('<svg width="200" height="112" viewBox="0 0 200 112" style="position: absolute; right: 0; top: 0;">'
              f'<text x="82" y="186" style="{OSW} font-weight: 700; font-size: 210px; fill: #ffffff; stroke: #ffffff; stroke-width: 12px; stroke-linejoin: round;">W</text>'
              f'<text x="82" y="186" style="{OSW} font-weight: 700; font-size: 210px; fill: #c99a2e; stroke: #3b0a0f; stroke-width: 1.5px; stroke-dasharray: 5px 4px;">W</text>'
              '</svg>')
    tabs = []
    for name, on in [('Breakfast', 0), ('Lunch', 1), ('Dinner', 0), ('Late night', 0), ("Grab 'N Go", 0)]:
        col = '#ffffff' if on else 'rgba(255,255,255,0.72)'
        bar = '#c99a2e' if on else 'transparent'
        icon = BAG if name.startswith('Grab') else ''
        tabs.append(f'<div style="height: 46px; display: flex; align-items: center; gap: 6px; flex-shrink: 0; font-size: 15px; font-weight: {600 if on else 500}; color: {col}; border-bottom: 3px solid {bar}; box-sizing: border-box; padding-top: 3px; white-space: nowrap;">{icon}{name}</div>')
    return f'''  <div style="position: relative; background: #881c1c; height: 112px; overflow: hidden;">
    {letter}
    <div style="position: relative; display: flex; align-items: center; padding: 10px 0 0 6px; height: 48px;">
      <div style="width: 44px; height: 44px; display: flex; align-items: center; justify-content: center;">{CHEV_L}</div>
      <div style="{OSW} font-weight: 600; font-size: 34px; line-height: 1; color: #ffffff;">Worcester</div>
      <div style="width: 44px; height: 44px; display: flex; align-items: center; justify-content: center;">{INFO}</div>
    </div>
    <div style="position: relative; display: flex; align-items: center; padding-left: 6px; height: 48px; font-size: 15px; color: #ffffff;">
      <div style="width: 44px; height: 44px; display: flex; align-items: center; justify-content: center;">{SM_L}</div>
      <div style="min-width: 86px; text-align: center;">Wed, Oct 8</div>
      <div style="width: 44px; height: 44px; display: flex; align-items: center; justify-content: center;">{SM_R}</div>
    </div>
  </div>
  <div style="background: #3b0a0f; display: flex; gap: 22px; padding: 0 20px; overflow: hidden;">
    {''.join(tabs)}
  </div>
'''


def num(n, unit, size=16):
    return (f'<span style="{OSW} font-weight: 500; font-size: {size}px; font-variant-numeric: tabular-nums; color: #24171a;">{n}</span>'
            f'<span style="font-size: 13px; color: #6e6266; margin-left: 3px;">{unit}</span>')


PLUS = ('<div style="width: 44px; height: 44px; flex-shrink: 0; display: flex; align-items: center; justify-content: center;">'
        '<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M9 3v12M3 9h12" style="stroke: #881c1c; stroke-width: 2.2px; stroke-linecap: round;"></path></svg></div>')


def stepper(q):
    btn = 'width: 44px; height: 44px; display: flex; align-items: center; justify-content: center;'
    minus = '<svg width="14" height="14" viewBox="0 0 18 18" fill="none"><path d="M3 9h12" style="stroke: #881c1c; stroke-width: 2px; stroke-linecap: round;"></path></svg>'
    plus = '<svg width="14" height="14" viewBox="0 0 18 18" fill="none"><path d="M9 3v12M3 9h12" style="stroke: #881c1c; stroke-width: 2px; stroke-linecap: round;"></path></svg>'
    return (f'<div style="display: flex; align-items: center; flex-shrink: 0; background: #f3e4e4; border-radius: 8px;">'
            f'<div style="{btn}">{minus}</div>'
            f'<div style="{OSW} font-weight: 600; font-size: 20px; min-width: 20px; text-align: center; color: #881c1c; font-variant-numeric: tabular-nums;">{q}</div>'
            f'<div style="{btn}">{plus}</div></div>')


def row(name, cal, pro, q=0, last=False):
    rule = '' if last else 'border-bottom: 1px solid rgba(36,23,26,0.12);'
    return f'''    <div style="display: flex; align-items: center; gap: 12px; min-height: 64px; margin-left: 20px; padding-right: 32px; {rule}">
      <div style="flex-grow: 1; min-width: 0;">
        <div style="font-size: 16px; font-weight: {600 if q else 500}; line-height: 1.3;">{name}</div>
        <div style="margin-top: 2px; display: flex; gap: 12px; align-items: baseline;"><span>{num(cal, 'cal')}</span><span>{num(pro + 'g', 'protein')}</span></div>
      </div>
      {stepper(q) if q else PLUS}
    </div>
'''


def station(name):
    return f'    <div style="{OSW} font-weight: 600; font-size: 22px; line-height: 1.2; color: #3b0a0f; padding: 18px 20px 4px 20px;">{name}</div>\n'


def menu_list(full=True):
    s = '  <div style="position: relative;">\n'
    s += station('Grill Station')
    s += row('Black Bean Burger', '160', '7')
    s += row('Golden BBQ Chicken Thigh', '93', '13.3', q=2)
    s += row('Halal Burger Patty', '144', '12.6')
    s += row('Halal French Fries', '193', '1.8', last=True)
    if full:
        s += station('Noodle Bowl')
        s += row('Beef Brisket Noodle Bowl', '218', '12.3', q=1)
        s += row('Bean Sprouts', '2', '0.2')
        s += row('Hard Boiled Egg', '111', '10.7', last=True)
        s += station('Street Food')
        s += row('Mee Goreng', '107', '4.3')
        s += row('Braised Pulmuone Tofu', '123', '9.2')
    s += '  </div>\n'
    return s


def scrubber():
    # one segment per station, height proportional to its dish count (4,3,4,3,3,2,2)
    segs = []
    for i, n in enumerate([4, 3, 4, 3, 3, 2, 2]):
        col = '#881c1c' if i == 0 else 'rgba(36,23,26,0.16)'
        segs.append(f'<div style="height: {n * 24}px; width: 4px; border-radius: 2px; background: {col};"></div>')
    return ('  <div style="position: absolute; right: 0; top: 182px; width: 24px; display: flex; flex-direction: column; align-items: center; gap: 5px;">'
            + ''.join(segs) + '</div>\n')


UP = '<svg width="16" height="16" viewBox="0 0 14 14" fill="none"><path d="M3 9l4-4 4 4" style="stroke: rgba(255,255,255,0.72); stroke-width: 1.6px; stroke-linecap: round; stroke-linejoin: round;"></path></svg>'


def plate_bar():
    w = "color: #ffffff;"
    big = f'{OSW} font-weight: 500; font-size: 26px; line-height: 1; font-variant-numeric: tabular-nums; {w}'
    unit = 'font-size: 14px; color: rgba(255,255,255,0.78); margin-left: 4px;'
    return f'''  <div style="position: absolute; left: 0; right: 0; bottom: 0; background: #3b0a0f; padding: 12px 16px 30px 20px; display: flex; align-items: center; justify-content: space-between;">
    <div style="display: flex; flex-direction: column; gap: 4px;">
      <div style="display: flex; align-items: center; gap: 6px; font-size: 13px; color: rgba(255,255,255,0.78);">{UP}3 items</div>
      <div style="display: flex; align-items: baseline; gap: 16px;"><span><span style="{big}">404</span><span style="{unit}">cal</span></span><span><span style="{big}">38.9g</span><span style="{unit}">protein</span></span></div>
    </div>
    <div style="height: 50px; padding: 0 30px; border-radius: 8px; background: #c99a2e; color: #3b0a0f; display: flex; align-items: center; font-size: 17px; font-weight: 700;">Log</div>
  </div>
'''


def sheet():
    dish = lambda name, cal, q, last=False: f'''      <div style="display: flex; align-items: center; gap: 12px; min-height: 64px; {'' if last else 'border-bottom: 1px solid rgba(36,23,26,0.12);'}">
        <div style="flex-grow: 1;">
          <div style="font-size: 16px; font-weight: 600;">{name}</div>
          <div style="margin-top: 2px;">{num(cal, 'cal each')}</div>
        </div>
        {stepper(q)}
      </div>
'''
    line = lambda k, v, last=False: (f'<div style="display: flex; justify-content: space-between; align-items: baseline; padding: 6px 0; {"" if last else "border-bottom: 1px solid #3b0a0f;"}">'
                                     f'<span style="font-size: 15px; font-weight: 600; color: #3b0a0f;">{k}</span>'
                                     f'<span style="{OSW} font-weight: 500; font-size: 20px; font-variant-numeric: tabular-nums; color: #3b0a0f;">{v}</span></div>')
    search = ('<svg width="18" height="18" viewBox="0 0 20 20" fill="none"><circle cx="9" cy="9" r="5.5" style="stroke: #6e6266; stroke-width: 1.7px;"></circle><path d="M13.5 13.5L17 17" style="stroke: #6e6266; stroke-width: 1.7px; stroke-linecap: round;"></path></svg>')
    barcode = ('<svg width="22" height="18" viewBox="0 0 22 18" fill="none"><path d="M2 2v14M5 2v14M8 2v14M12 2v14M14 2v14M18 2v14M20 2v14" style="stroke: #881c1c; stroke-width: 1.6px;"></path></svg>')
    return f'''  <div style="position: absolute; inset: 0; background: rgba(36,10,14,0.56);"></div>
  <div style="position: absolute; left: 0; right: 0; bottom: 0; background: #f8f9fb; border-radius: 16px 16px 0 0; padding: 8px 20px 30px 20px;">
    <div style="display: flex; justify-content: center; height: 16px; align-items: center;"><div style="width: 36px; height: 5px; border-radius: 3px; background: rgba(36,23,26,0.22);"></div></div>
    <div style="display: flex; align-items: baseline; justify-content: space-between; margin-top: 8px;">
      <div style="{OSW} font-weight: 600; font-size: 32px; line-height: 1.1; color: #3b0a0f;">Your plate</div>
      <div style="font-size: 15px; color: #6e6266;">Worcester lunch</div>
    </div>
    <div style="margin-top: 6px;">
{dish('Golden BBQ Chicken Thigh', '93', 2)}{dish('Beef Brisket Noodle Bowl', '218', 1, last=True)}    </div>
    <div style="margin-top: 10px; border: 2px solid #3b0a0f; padding: 4px 12px 2px 12px;">
      <div style="display: flex; justify-content: space-between; align-items: baseline; padding-bottom: 4px; border-bottom: 7px solid #3b0a0f;">
        <span style="font-size: 20px; font-weight: 700; color: #3b0a0f;">Calories</span>
        <span style="{OSW} font-weight: 600; font-size: 40px; line-height: 1.05; font-variant-numeric: tabular-nums; color: #3b0a0f;">404</span>
      </div>
      {line('Protein', '38.9g')}
      {line('Carbs', '34g')}
      {line('Fat', '12.4g', last=True)}
    </div>
    <div style="margin-top: 16px; height: 54px; border-radius: 8px; background: #881c1c; color: #ffffff; display: flex; align-items: center; justify-content: center; font-size: 17px; font-weight: 700;">Log 3 items</div>
    <div style="margin-top: 10px; height: 48px; border-radius: 8px; background: #eceef2; display: flex; align-items: center; gap: 10px; padding: 0 4px 0 14px;">
      {search}<div style="flex-grow: 1; font-size: 16px; color: #6e6266;">Add something else</div>
      <div style="width: 44px; height: 44px; display: flex; align-items: center; justify-content: center;">{barcode}</div>
    </div>
  </div>
'''


with open(os.path.join(OUT, 'D1HallMenu.dc.html'), 'w') as f:
    f.write(HEAD + header() + menu_list() + scrubber() + plate_bar() + TAIL)
with open(os.path.join(OUT, 'D1PlateSheet.dc.html'), 'w') as f:
    f.write(HEAD + header() + menu_list(full=False) + sheet() + TAIL)
