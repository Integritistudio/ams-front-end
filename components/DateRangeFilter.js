'use client';

import { DATE_RANGE_PRESETS, emptyDateRange } from '../lib/dateRange';

/**
 * Preset + optional custom from/to date filter for list toolbars.
 * value: { preset, from, to }
 */
export default function DateRangeFilter({
  value,
  onChange,
  className = '',
}) {
  const state = value || emptyDateRange();
  const isCustom = state.preset === 'custom';

  function setPreset(preset) {
    onChange?.({
      ...state,
      preset,
      from: preset === 'custom' ? state.from : '',
      to: preset === 'custom' ? state.to : '',
    });
  }

  function setCustom(field, next) {
    onChange?.({ ...state, preset: 'custom', [field]: next });
  }

  return (
    <div className={`date-range-filter ${className}`.trim()}>
      <div className="filter-box date-range-preset">
        <select
          className="form-control form-control-select"
          value={state.preset || 'all'}
          onChange={(e) => setPreset(e.target.value)}
          aria-label="Date range"
          title="Filter by date"
        >
          {DATE_RANGE_PRESETS.map((p) => (
            <option key={p.value} value={p.value}>{p.label}</option>
          ))}
        </select>
      </div>
      {isCustom ? (
        <div className="date-range-custom">
          <input
            type="date"
            className="form-control"
            value={state.from || ''}
            onChange={(e) => setCustom('from', e.target.value)}
            aria-label="From date"
            title="From date"
          />
          <span className="date-range-sep">to</span>
          <input
            type="date"
            className="form-control"
            value={state.to || ''}
            onChange={(e) => setCustom('to', e.target.value)}
            aria-label="To date"
            title="To date"
          />
        </div>
      ) : null}
    </div>
  );
}
