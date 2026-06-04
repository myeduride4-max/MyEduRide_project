// @ts-nocheck
'use client';

import { photoSrc } from '@/lib/photo';
import PickupPersonBadge from '@/components/pickup/PickupPersonBadge';

function PickupPersonCard({ name, phone, photoUrl, relationship }) {
  const src = photoSrc(photoUrl);
  return (
    <div className="flex items-center gap-3 p-3 rounded-xl bg-white border border-slate-200">
      {src ? (
        <img src={src} alt={name} className="w-16 h-16 rounded-xl object-cover border border-slate-100 shrink-0" />
      ) : (
        <div className="w-16 h-16 rounded-xl bg-slate-100 shrink-0 flex items-center justify-center text-[10px] text-slate-400">
          No photo
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="font-bold text-slate-900 truncate">{name || 'Unknown'}</p>
        {phone && <p className="text-sm font-mono text-slate-600">{phone}</p>}
        {relationship && <p className="text-xs text-slate-500 capitalize">{relationship}</p>}
      </div>
    </div>
  );
}

function resolvePickupPhoto(photoUrl, name, phone, persons = []) {
  if (photoUrl) {
    const src = photoSrc(photoUrl);
    if (src) return src;
  }
  if (!persons.length) return null;
  const n = (name || '').trim().toLowerCase();
  const ph = (phone || '').replace(/\s/g, '');
  for (const p of persons) {
    if (n && p.name?.trim().toLowerCase() === n && p.photo_url) return photoSrc(p.photo_url);
    if (ph && p.phone && p.phone.replace(/\s/g, '') === ph && p.photo_url) return photoSrc(p.photo_url);
  }
  if (persons[0]?.photo_url) return photoSrc(persons[0].photo_url);
  return null;
}

function NoticeBox({ notice, photoUrl, persons = [] }) {
  if (!notice?.pickup_person_name) return null;
  const src = resolvePickupPhoto(photoUrl, notice.pickup_person_name, notice.pickup_person_phone, persons);
  const noteText = notice.notes?.trim() || notice.message?.trim() || '';

  return (
    <div className="rounded-xl border-2 border-blue-200 bg-blue-50 p-3">
      <p className="text-sm font-bold text-blue-900 mb-2">Expected pickup person</p>
      <div className="flex gap-3 items-start">
        {src ? (
          <img src={src} alt="" className="w-14 h-14 rounded-lg object-cover shrink-0 border border-blue-100" />
        ) : null}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-blue-800">
            {notice.pickup_person_name}
            {notice.pickup_person_phone ? (
              <span className="font-bold"> · {notice.pickup_person_phone}</span>
            ) : null}
          </p>
          {noteText && <p className="text-sm text-blue-700 mt-1">{noteText}</p>}
        </div>
      </div>
    </div>
  );
}

/** Gate / admin — verify authorised pickup person before student release. */
export default function StudentPickupVerify({
  pickupNotice,
  pickupRequest,
  pickupPersons = [],
  readyForPickup = false,
}) {
  const notice = pickupNotice;
  const request = pickupRequest;
  const persons = pickupPersons || [];

  const expectedName =
    notice?.pickup_person_name ||
    request?.pickup_person_name ||
    persons[0]?.name ||
    null;
  const expectedPhone =
    notice?.pickup_person_phone ||
    request?.pickup_person_phone ||
    persons[0]?.phone ||
    null;
  const source = notice?.pickup_person_name
    ? 'notice'
    : request?.pickup_person_name
      ? 'request'
      : persons.length
        ? 'authorised'
        : null;

  return (
    <div className="rounded-2xl border-2 border-orange-200 bg-orange-50/80 p-4 space-y-3">
      <p className="text-xs font-bold text-orange-900 uppercase tracking-wide">
        Verify pickup person before release
      </p>
      {readyForPickup && (
        <p className="text-xs font-semibold text-emerald-800 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">
          Teacher marked this student ready for pickup
        </p>
      )}
      {notice && (
        <NoticeBox
          notice={notice}
          photoUrl={notice.pickup_person_photo || null}
          persons={persons}
        />
      )}
      {request && !notice && (
        <NoticeBox
          notice={{
            pickup_person_name: request.pickup_person_name,
            pickup_person_phone: request.pickup_person_phone,
            message: request.message,
          }}
          photoUrl={request.pickup_person_photo || null}
          persons={persons}
        />
      )}
      {persons.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-slate-700">Authorised on file</p>
          {persons.map((pp) => (
            <PickupPersonCard
              key={pp.id}
              name={pp.name}
              phone={pp.phone}
              photoUrl={pp.photo_url}
              relationship={pp.relationship}
            />
          ))}
        </div>
      )}
      {!expectedName && persons.length === 0 && (
        <p className="text-sm text-orange-800 font-medium">
          No authorised pickup person on file — confirm identity with parent or school office before release.
        </p>
      )}
      {expectedName && !notice && !request && (
        <PickupPersonBadge name={expectedName} phone={expectedPhone} source={source} persons={persons} />
      )}
    </div>
  );
}
