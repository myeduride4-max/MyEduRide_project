// @ts-nocheck
'use client';

/** Shows who is authorised / expected to pick up a student today. */
export default function PickupPersonBadge({ name, phone, source, persons = [] }) {
  if (!name && persons.length === 0) {
    return (
      <p className="text-[10px] text-amber-700 mt-0.5 font-medium">
        No pickup person on file — verify ID at gate
      </p>
    );
  }

  const label =
    source === 'notice'
      ? 'Parent notice'
      : source === 'request'
        ? 'Pickup message'
        : source === 'authorised'
          ? 'Authorised pickup'
          : 'Pickup';

  return (
    <div className="mt-0.5">
      {name && (
        <p className="text-[10px] text-blue-800 font-semibold">
          {label}: {name}
          {phone ? ` · ${phone}` : ''}
        </p>
      )}
      {!name && persons.length > 0 && (
        <p className="text-[10px] text-blue-800 font-semibold">
          Authorised: {persons.map((p) => p.name).join(', ')}
        </p>
      )}
    </div>
  );
}
