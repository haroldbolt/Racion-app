import { useId } from 'react';

interface Props {
  isEs: boolean;
  value: string;
  onChange: (value: string) => void;
  invalid: boolean;
  disabled?: boolean;
}

export function BogotaPostalCodeField({isEs, value, onChange, invalid, disabled}: Props) {
  const inputId = useId();
  return <div className="space-y-1.5">
    <div className="flex items-baseline gap-2">
      <label htmlFor={inputId} className="text-xs font-bold text-[var(--text-primary)]">
        {isEs ? 'Código postal de Bogotá' : 'Bogotá postal code'}
      </label>
      <span className="text-xs text-[var(--text-secondary)]">{isEs ? 'Opcional' : 'Optional'}</span>
    </div>
    <input id={inputId} type="text" inputMode="numeric" autoComplete="postal-code" value={value}
      onChange={event => onChange(event.target.value)} disabled={disabled}
      aria-invalid={invalid || undefined} aria-describedby={invalid ? inputId + '-error' : undefined}
      className="min-h-11 w-full rounded-xl border border-[var(--border-color)] bg-[var(--surface-subtle)] px-2.5 text-sm font-semibold tabular-nums focus-visible:outline-2" />
    {invalid && <p id={inputId + '-error'} role="alert" className="text-xs font-bold text-red-800 dark:text-red-300">
      {isEs ? 'Escribe seis dígitos que empiecen por 11.' : 'Enter six digits starting with 11.'}
    </p>}
  </div>;
}
