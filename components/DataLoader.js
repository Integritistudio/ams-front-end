'use client';

/**
 * Colorful multi-orbit loader used for auth shell and data fetches.
 * @param {'page'|'block'|'inline'} [variant='block']
 * @param {string} [label]
 * @param {number} [colSpan] — when set, wraps in a table row for helpdesk tables
 */
export default function DataLoader({
  variant = 'block',
  label = 'Loading…',
  colSpan,
}) {
  const body = (
    <div
      className={`data-loader data-loader--${variant}`}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="data-loader__orbits" aria-hidden="true">
        <span className="data-loader__ring data-loader__ring--a" />
        <span className="data-loader__ring data-loader__ring--b" />
        <span className="data-loader__ring data-loader__ring--c" />
        <span className="data-loader__core">
          <i className="fa-solid fa-bolt" />
        </span>
        <span className="data-loader__dot data-loader__dot--1" />
        <span className="data-loader__dot data-loader__dot--2" />
        <span className="data-loader__dot data-loader__dot--3" />
        <span className="data-loader__dot data-loader__dot--4" />
      </div>
      {label ? <p className="data-loader__label">{label}</p> : null}
    </div>
  );

  if (colSpan) {
    return (
      <tr className="data-loader-row">
        <td colSpan={colSpan}>{body}</td>
      </tr>
    );
  }

  return body;
}
