#!/bin/bash
# strips.sh strip <ver> | compare : per-interaction step (ms) and crop
cd "$(dirname "$0")"
spec() { case $1 in
  add|add2|qty|remove) echo "33.3 0,440,390,404";;
  sheet|sheetdrag|log|undo|detail|detailadd|open|close|cafe|hallresult|placeopen|pinopen|eventopen|eventclose|eventpeek|eventpeekclose|searchdetail|searchdetailclose|laterdetail|detailclose|evnote|evnoteclose|pinclose|placeclose|areaopen|areaclose|youopen|youclose|platelabel|custom|sheetclose|stationclose|hallresultclose|platedetail|cafeback|servinghallback) echo "40";;
  dragback|dragcancel|edgeswipe|edgecollapsed|serving|eventdrag|searchdetaildrag|servinghall|detaildrag|searchdetailup|platedetailclose|servingsame|pushedge|pushedgecancel|halledge|pindrag) echo "60";;
  mealtab|lens|ingredients|busy|showall) echo "50";;
  daychange|daychangecollapsed|schedday|schedstatus) echo "60";;
  *) echo "100";; esac; }
for n in add add2 qty remove sheet sheetdrag log undo mealtab station detail detailadd ingredients tabs typing lens events cafe busy open close collapse closecollapsed dragback dragcancel edgeswipe edgecollapsed hallresult placeopen serving pinopen eventopen eventclose eventdrag eventpeek eventpeekclose searchdetail searchdetailclose searchdetaildrag laterdetail detailclose evnote evnoteclose pinclose placeclose areaopen areaclose youopen platelabel custom sheetclose stationclose hallresultclose servinghall searchdetailup platedetail platedetailclose servingsame cafeback pushedge pushedgecancel halledge servinghallback pindrag youclose detaildrag daychange daychangecollapsed schedday schedstatus showall; do
  [ -n "$3" ] && [ "$3" != "$n" ] && continue
  if [ "$1" = compare ]; then python3 sheet.py compare $n $(spec $n); else python3 sheet.py strip $2 $n $(spec $n); fi
done
