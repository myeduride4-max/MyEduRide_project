import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { getSessionFromRequest } from '@/lib/session';
import { todayInLagos } from '@/lib/timezone';
import { resolveReportCapabilities } from '@/lib/attendance/report-access';
import {
  fetchSchoolCalendarContext,
  isCountableSchoolDayWithContext,
  isWeekendDay,
} from '@/lib/attendance/school-calendar';
import {
  lagosDateStringsInRange,
  lagosDayBoundsFromDateStr,
  resolveLagosReportRange,
  timestampToLagosDateKey,
} from '@/lib/attendance/lagos-dates';
import {
  buildStaffDailyReport,
  buildStaffMonthlyReport,
  fetchSchoolLateThreshold,
} from '@/lib/attendance/staff-report';
import { normalizeArrivalStatus } from '@/lib/attendance/status';
import { fetchReportStudents } from '@/lib/attendance/report-students';

export const dynamic = 'force-dynamic';

/**
 * GET /api/attendance/reports
 * Query params:
 *   school_id  — required for admin/teacher
 *   type       — 'daily' | 'weekly' | 'monthly'
 *   date       — YYYY-MM-DD (daily / week anchor)
 *   month      — YYYY-MM full calendar month (monthly only; preferred over date)
 *   class_id   — optional filter
 *   format     — 'json' (default) | 'csv'
 */
export async function GET(request: NextRequest) {
  try {
    const session = getSessionFromRequest(request);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const sp = request.nextUrl.searchParams;
    const schoolId = sp.get('school_id');
    const reportType = sp.get('type') || 'daily';
    const monthParam = sp.get('month');
    let dateParam = sp.get('date') || todayInLagos();
    if (reportType === 'monthly' && monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
      dateParam = `${monthParam}-01`;
    }
    const classId = sp.get('class_id');
    const format = sp.get('format') || 'json';
    const monthLabel = reportType === 'monthly' ? (monthParam || dateParam.slice(0, 7)) : null;

    const supabase = getAdminClient();
    const caps = await resolveReportCapabilities(supabase, session, schoolId);
    if ('error' in caps) return NextResponse.json({ error: caps.error }, { status: 403 });

    const resolvedSchoolId = caps.schoolId;
    const includeStaff = caps.canStaffReports;
    const lateThreshold = await fetchSchoolLateThreshold(supabase, resolvedSchoolId);

    const { startDateStr, endDateStr, rangeStartIso, rangeEndIso } = resolveLagosReportRange(
      reportType,
      dateParam
    );

    const calendarCtx = await fetchSchoolCalendarContext(
      supabase,
      resolvedSchoolId,
      startDateStr,
      endDateStr
    );
    const nonSchoolDays = calendarCtx.nonSchoolDays;
    const isCountableDay = (dayKey: string) => isCountableSchoolDayWithContext(dayKey, calendarCtx);

    if (caps.studentIds != null && caps.studentIds.length === 0) {
      return NextResponse.json({
        type: reportType,
        date: reportType === 'daily' ? dateParam : undefined,
        month: monthLabel,
        summary: { total: 0, present: 0, late: 0, absent: 0 },
        report: [],
        message: 'No students in your assigned class',
        range: { start: rangeStartIso, end: rangeEndIso, start_date: startDateStr, end_date: endDateStr },
      });
    }

    let students: Awaited<ReturnType<typeof fetchReportStudents>>['students'] = [];
    if (caps.canStudentReports) {
      const studResult = await fetchReportStudents(supabase, resolvedSchoolId, {
        studentIds: caps.studentIds,
        classId,
      });
      if (studResult.error) return NextResponse.json({ error: studResult.error }, { status: 500 });
      students = studResult.students;
    }

    const studentIds = students.map((s) => s.id);
    if (studentIds.length === 0 && caps.canStudentReports) {
      const emptyPayload: Record<string, unknown> = {
        type: reportType,
        date: reportType === 'daily' ? dateParam : undefined,
        month: monthLabel,
        summary: { total: 0, present: 0, late: 0, absent: 0 },
        report: [],
        range: { start: rangeStartIso, end: rangeEndIso, start_date: startDateStr, end_date: endDateStr },
        message: 'No active students found for this school or class',
      };
      if (includeStaff && reportType === 'daily') {
        const { startIso: dayStartIso, endIso: dayEndIso } = lagosDayBoundsFromDateStr(dateParam);
        const staffOnly = await buildStaffDailyReport(
          supabase,
          resolvedSchoolId,
          dateParam,
          dayStartIso,
          dayEndIso,
          { staffUserIds: caps.staffUserIds, lateThreshold }
        );
        emptyPayload.staff_report = staffOnly;
        emptyPayload.staff_summary = {
          total: staffOnly.length,
          present: staffOnly.filter((s) => s.status === 'present').length,
          absent: staffOnly.filter((s) => s.status === 'absent').length,
        };
      }
      return NextResponse.json(emptyPayload);
    }

    if (studentIds.length === 0 && !includeStaff) {
      return NextResponse.json({
        type: reportType,
        date: reportType === 'daily' ? dateParam : undefined,
        month: monthLabel,
        summary: { total: 0, present: 0, late: 0, absent: 0 },
        report: [],
        message: 'No data available',
        range: { start: rangeStartIso, end: rangeEndIso, start_date: startDateStr, end_date: endDateStr },
      });
    }

    if (studentIds.length === 0 && includeStaff && !caps.canStudentReports) {
      const dayStrings = lagosDateStringsInRange(startDateStr, endDateStr);
      const monthCalendarDays =
        reportType === 'monthly' || reportType === 'weekly'
          ? dayStrings
          : dayStrings.filter(isCountableDay);

      if (reportType === 'daily') {
        const { startIso: dayStartIso, endIso: dayEndIso } = lagosDayBoundsFromDateStr(dateParam);
        const dayExcluded = !isCountableDay(dateParam);
        const staffReport = await buildStaffDailyReport(
          supabase,
          resolvedSchoolId,
          dateParam,
          dayStartIso,
          dayEndIso,
          { staffUserIds: caps.staffUserIds, excluded: dayExcluded, lateThreshold }
        );
        if (dayExcluded) {
          return NextResponse.json({
            type: 'daily',
            date: dateParam,
            excluded: true,
            excluded_title:
              calendarCtx.nonSchoolDays.get(dateParam)?.title ||
              (isWeekendDay(dateParam, calendarCtx.weekendDays) ? 'Weekend' : 'Non-school day'),
            summary: { total: 0, present: 0, late: 0, absent: 0 },
            report: [],
            staff_report: staffReport,
            staff_summary: {
              total: staffReport.length,
              present: 0,
              late: 0,
              absent: 0,
            },
          });
        }
        return NextResponse.json({
          type: 'daily',
          date: dateParam,
          summary: { total: 0, present: 0, late: 0, absent: 0 },
          report: [],
          staff_report: staffReport,
          staff_summary: {
            total: staffReport.length,
            present: staffReport.filter((s) => s.status === 'present').length,
            absent: staffReport.filter((s) => s.status === 'absent').length,
          },
        });
      }

      const staffReport = await buildStaffMonthlyReport(
        supabase,
        resolvedSchoolId,
        rangeStartIso,
        rangeEndIso,
        monthCalendarDays,
        { staffUserIds: caps.staffUserIds, nonSchoolDays, lateThreshold }
      );

      return NextResponse.json({
        type: reportType,
        month: monthLabel,
        range: { start: rangeStartIso, end: rangeEndIso, start_date: startDateStr, end_date: endDateStr },
        summary: {
          total_students: 0,
          total_days: monthCalendarDays.filter(isCountableDay).length,
          total_staff: staffReport.length,
        },
        staff_report: staffReport,
      });
    }

    let records: {
      student_id: string;
      type: string;
      status: string;
      timestamp: string;
      minutes_late: number | null;
      source: string | null;
    }[] = [];

    if (studentIds.length > 0) {
      const recRes = await supabase
        .from('attendance_records')
        .select('student_id, type, status, timestamp, minutes_late, source')
        .eq('school_id', resolvedSchoolId)
        .in('student_id', studentIds)
        .gte('timestamp', rangeStartIso)
        .lte('timestamp', rangeEndIso)
        .order('timestamp', { ascending: true });

      if (recRes.error && /minutes_late|source/i.test(recRes.error.message)) {
        const legacy = await supabase
          .from('attendance_records')
          .select('student_id, type, status, timestamp')
          .eq('school_id', resolvedSchoolId)
          .in('student_id', studentIds)
          .gte('timestamp', rangeStartIso)
          .lte('timestamp', rangeEndIso)
          .order('timestamp', { ascending: true });
        if (legacy.error) return NextResponse.json({ error: legacy.error.message }, { status: 500 });
        records = (legacy.data || []).map((r) => ({ ...r, minutes_late: null, source: null }));
      } else if (recRes.error) {
        return NextResponse.json({ error: recRes.error.message }, { status: 500 });
      } else {
        records = recRes.data || [];
      }
    }

    const { data: departures } =
      studentIds.length > 0
        ? await supabase
            .from('attendance_records')
            .select('student_id, timestamp')
            .eq('school_id', resolvedSchoolId)
            .in('student_id', studentIds)
            .eq('type', 'departure')
            .gte('timestamp', rangeStartIso)
            .lte('timestamp', rangeEndIso)
            .order('timestamp', { ascending: false })
        : { data: [] };

    const departureMap: Record<string, Record<string, string>> = {};
    for (const d of departures || []) {
      const dayKey = timestampToLagosDateKey(d.timestamp);
      if (!departureMap[d.student_id]) departureMap[d.student_id] = {};
      if (!departureMap[d.student_id][dayKey]) {
        departureMap[d.student_id][dayKey] = d.timestamp;
      }
    }

    const arrivalMap: Record<string, Record<string, { status: string; timestamp: string; minutes_late: number | null; source: string | null }>> = {};
    for (const r of records || []) {
      if (r.type !== 'arrival') continue;
      const dayKey = timestampToLagosDateKey(r.timestamp);
      if (!arrivalMap[r.student_id]) arrivalMap[r.student_id] = {};
      if (!arrivalMap[r.student_id][dayKey]) {
        arrivalMap[r.student_id][dayKey] = r;
      }
    }

    if (reportType === 'daily') {
      const dayKey = dateParam;
      const { startIso: dayStartIso, endIso: dayEndIso } = lagosDayBoundsFromDateStr(dayKey);
      const dayExcluded = !isCountableDay(dayKey);
      const excludedInfo = calendarCtx.nonSchoolDays.get(dayKey);
      const excludedTitle =
        excludedInfo?.title ||
        (isWeekendDay(dayKey, calendarCtx.weekendDays) ? 'Weekend' : 'Non-school day');

      const staffReport =
        includeStaff
          ? await buildStaffDailyReport(
              supabase,
              resolvedSchoolId,
              dayKey,
              dayStartIso,
              dayEndIso,
              {
                staffUserIds: caps.staffUserIds,
                excluded: dayExcluded,
                lateThreshold,
              }
            )
          : [];

      if (dayExcluded) {
        return NextResponse.json({
          type: 'daily',
          date: dayKey,
          excluded: true,
          excluded_title: excludedTitle,
          summary: { total: (students || []).length, present: 0, late: 0, absent: 0 },
          report: [],
          staff_report: includeStaff ? staffReport : undefined,
          staff_summary: includeStaff
            ? { total: staffReport.length, present: 0, late: 0, absent: 0 }
            : undefined,
        });
      }
      const report = students.map((s) => {
        const arrival = arrivalMap[s.id]?.[dayKey];
        const departure = departureMap[s.id]?.[dayKey];
        const rawStatus = arrival ? arrival.status : 'absent';
        const status =
          rawStatus === 'on_time' ? 'present' : rawStatus === 'absent' ? 'absent' : rawStatus;
        return {
          student_id: s.id,
          student_id_number: s.student_id_number,
          first_name: s.first_name,
          last_name: s.last_name,
          class_name: s.class_name,
          class_id: s.class_id,
          status: departure && !arrival ? 'dismissed' : status,
          dismissed: !!departure,
          check_in_time: arrival?.timestamp || null,
          check_out_time: departure || null,
          minutes_late: arrival?.minutes_late ?? null,
          source: arrival?.source || null,
        };
      });

      const staffPresent = staffReport.filter((s) => s.status === 'present').length;
      const staffLate = staffReport.filter((s) => s.status === 'late').length;
      const staffAbsent = staffReport.filter((s) => s.status === 'absent').length;

      if (format === 'csv') {
        const csvRows: Record<string, string | number | null>[] = report.map((r) => ({
          entity: 'student',
          name: `${r.first_name} ${r.last_name}`,
          role_or_class: r.class_name,
          status: r.status,
          check_in_time: r.check_in_time || '',
          check_out_time: r.check_out_time || '',
          minutes_late: r.minutes_late ?? '',
        }));
        for (const s of staffReport) {
          csvRows.push({
            entity: 'staff',
            name: s.full_name,
            role_or_class: s.role,
            status: s.status,
            check_in_time: s.clock_in_time || '',
            check_out_time: s.clock_out_time || '',
            minutes_late: s.minutes_late ?? '',
          });
        }
        return buildCsvResponse(csvRows, `daily_${dateParam}`);
      }

      const present = report.filter((r: { status: string }) => r.status !== 'absent').length;
      const late = report.filter((r: { status: string }) => r.status === 'late').length;
      const absent = report.filter((r: { status: string }) => r.status === 'absent').length;

      return NextResponse.json({
        type: 'daily',
        date: dateParam,
        summary: { total: report.length, present, late, absent },
        report,
        staff_report: includeStaff ? staffReport : undefined,
        staff_summary: includeStaff
          ? {
              total: staffReport.length,
              present: staffPresent,
              late: staffLate,
              absent: staffAbsent,
            }
          : undefined,
      });
    }

    const dayStrings = lagosDateStringsInRange(startDateStr, endDateStr);

    const classMap: Record<string, { class_id: string; class_name: string; students: typeof students }> = {};
    for (const s of students) {
      if (!classMap[s.class_id]) {
        classMap[s.class_id] = { class_id: s.class_id, class_name: s.class_name, students: [] };
      }
      classMap[s.class_id].students.push(s);
    }

    const dailySummaries = dayStrings.map((dayKey) => {
      if (!isCountableDay(dayKey)) {
        const excluded = nonSchoolDays.get(dayKey);
        return {
          date: dayKey,
          present: 0,
          late: 0,
          absent: 0,
          total: (students || []).length,
          excluded: true,
          excluded_title: excluded?.title || (isWeekendDay(dayKey, calendarCtx.weekendDays) ? 'Weekend' : ''),
        };
      }
      let present = 0, late = 0, absent = 0;
      for (const s of students || []) {
        const arrival = arrivalMap[s.id]?.[dayKey];
        const normalized = normalizeArrivalStatus(arrival);
        if (!normalized) absent++;
        else if (normalized === 'late') late++;
        else present++;
      }
      return { date: dayKey, present, late, absent, total: (students || []).length, excluded: false };
    });

    const classBreakdown = Object.values(classMap).map((cls) => {
      let totalPresent = 0, totalLate = 0, totalAbsent = 0;
      for (const s of cls.students) {
        for (const dayKey of dayStrings) {
          if (!isCountableDay(dayKey)) continue;
          const arrival = arrivalMap[s.id]?.[dayKey];
          const normalized = normalizeArrivalStatus(arrival);
          if (!normalized) totalAbsent++;
          else if (normalized === 'late') totalLate++;
          else totalPresent++;
        }
      }
      const countableDays = dayStrings.filter(isCountableDay).length;
      const totalPossible = cls.students.length * countableDays;
      return {
        class_id: cls.class_id,
        class_name: cls.class_name,
        student_count: cls.students.length,
        total_present: totalPresent,
        total_late: totalLate,
        total_absent: totalAbsent,
        attendance_pct: totalPossible > 0
          ? Math.round(((totalPresent + totalLate) / totalPossible) * 100)
          : 0,
      };
    });

    const schoolDayStrings = dayStrings.filter(isCountableDay);
    const totalDays = schoolDayStrings.length;
    const totalStudents = (students || []).length;
    const grandPresent = dailySummaries.reduce((a, d) => a + d.present, 0);
    const grandLate = dailySummaries.reduce((a, d) => a + d.late, 0);
    const grandAbsent = dailySummaries.reduce((a, d) => a + d.absent, 0);
    const grandTotal = totalStudents * totalDays;
    const monthCalendarDays =
      reportType === 'monthly' || reportType === 'weekly' ? dayStrings : schoolDayStrings;

    const studentMonthly = students.map((s) => {
      let present = 0;
      let late = 0;
      let absent = 0;
      const days = monthCalendarDays.map((dayKey) => {
        if (isWeekendDay(dayKey, calendarCtx.weekendDays)) {
          return { date: dayKey, status: 'weekend' as const };
        }
        if (nonSchoolDays.has(dayKey)) {
          return { date: dayKey, status: 'excluded' as const, label: nonSchoolDays.get(dayKey)?.title };
        }
        const arrival = arrivalMap[s.id]?.[dayKey];
        const normalized = normalizeArrivalStatus(arrival);
        const status = normalized || 'absent';
        if (isCountableDay(dayKey)) {
          if (status === 'late') late++;
          else if (status === 'on_time') present++;
          else absent++;
        }
        return { date: dayKey, status };
      });
      const total = schoolDayStrings.length;
      return {
        student_id: s.id,
        student_id_number: s.student_id_number,
        first_name: s.first_name,
        last_name: s.last_name,
        class_name: s.class_name,
        present,
        late,
        absent,
        attendance_pct: total > 0 ? Math.round(((present + late) / total) * 100) : 0,
        days,
      };
    });

    const staffReport =
      (reportType === 'monthly' || reportType === 'weekly') && includeStaff
        ? await buildStaffMonthlyReport(
            supabase,
            resolvedSchoolId,
            rangeStartIso,
            rangeEndIso,
            monthCalendarDays,
            { staffUserIds: caps.staffUserIds, nonSchoolDays, lateThreshold }
          )
        : [];

    if (format === 'csv') {
      const rows: Record<string, string | number | null>[] = [];
      for (const s of students) {
        for (const dayKey of dayStrings) {
          const arrival = arrivalMap[s.id]?.[dayKey];
          const departure = departureMap[s.id]?.[dayKey];
          const normalized = normalizeArrivalStatus(arrival);
          rows.push({
            entity: 'student',
            date: dayKey,
            student_id_number: s.student_id_number,
            first_name: s.first_name,
            last_name: s.last_name,
            class_name: s.class_name,
            status: normalized || 'absent',
            check_in_time: arrival?.timestamp || '',
            check_out_time: departure || '',
            minutes_late: arrival?.minutes_late ?? '',
          });
        }
      }
      for (const staff of staffReport) {
        for (const day of staff.days) {
          rows.push({
            entity: 'staff',
            date: day.date,
            student_id_number: '',
            first_name: staff.full_name,
            last_name: '',
            class_name: staff.role,
            status: day.present ? 'present' : 'absent',
            check_in_time: '',
            check_out_time: '',
            minutes_late: '',
          });
        }
      }
      const label = reportType === 'monthly' && monthLabel ? `monthly_${monthLabel}` : `${reportType}_${dateParam}`;
      return buildCsvResponse(rows, label);
    }

    return NextResponse.json({
      type: reportType,
      month: monthLabel,
      range: { start: rangeStartIso, end: rangeEndIso, start_date: startDateStr, end_date: endDateStr },
      summary: {
        total_students: totalStudents,
        total_days: totalDays,
        school_days: schoolDayStrings.length,
        grand_present: grandPresent,
        grand_late: grandLate,
        grand_absent: grandAbsent,
        attendance_pct: grandTotal > 0
          ? Math.round(((grandPresent + grandLate) / grandTotal) * 100)
          : 0,
        total_staff: staffReport.length,
      },
      daily_summaries: dailySummaries,
      class_breakdown: classBreakdown,
      student_monthly:
        reportType === 'monthly' || reportType === 'weekly' ? studentMonthly : undefined,
      staff_report:
        (reportType === 'monthly' || reportType === 'weekly') && includeStaff
          ? staffReport
          : undefined,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed';
    console.error('[attendance/reports]', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function buildCsvResponse(rows: Record<string, unknown>[], label: string) {
  if (rows.length === 0) {
    return new NextResponse('No data', {
      headers: { 'Content-Type': 'text/csv', 'Content-Disposition': `attachment; filename="${label}.csv"` },
    });
  }
  const headers = Object.keys(rows[0]);
  const lines = rows.map((r) =>
    headers.map((h) => {
      const v = String(r[h] ?? '');
      return v.includes(',') || v.includes('"') ? `"${v.replace(/"/g, '""')}"` : v;
    }).join(',')
  );
  const csv = [headers.join(','), ...lines].join('\n');
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${label}.csv"`,
    },
  });
}
