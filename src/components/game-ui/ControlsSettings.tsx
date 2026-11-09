import { useId, useState, type KeyboardEvent } from 'react';
import {
  ACTION_LABELS,
  CONTROL_ACTIONS,
  TOUCH_GLYPHS,
  TOUCH_SLOTS,
  bindingLabel,
  keyLabel,
  type ControlAction,
  type ControlContext,
  type InputDevice,
} from '../../game/input/controlBindings';
import { useControlSettingsStore } from '../../game/state/controlSettingsStore';
import { useControlCapture } from './useControlCapture';
import { useGamepadMonitor } from './useGamepadMonitor';
import { getPadNeutral } from '../../game/input/gamepadInput';

const CONTEXTS = ['offense', 'defense'] as const;
const DEVICES = ['gamepad', 'keyboard', 'mobile'] as const;
const TITLES = {
  offense: 'Offense · napad',
  defense: 'Defense · odbrana',
  gamepad: 'Gamepad',
  keyboard: 'Keyboard',
  mobile: 'Mobile',
};

function navigateTabs(event: KeyboardEvent<HTMLButtonElement>) {
  const tabs = [
    ...(event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]') ??
      []),
  ];
  const current = tabs.indexOf(event.currentTarget);
  let next: number;
  if (event.key === 'ArrowRight') next = (current + 1) % tabs.length;
  else if (event.key === 'ArrowLeft') next = (current + tabs.length - 1) % tabs.length;
  else if (event.key === 'Home') next = 0;
  else if (event.key === 'End') next = tabs.length - 1;
  else return;
  event.preventDefault();
  tabs[next]?.focus();
  tabs[next]?.click();
}

export function ControlsSettings({ onBack }: { readonly onBack: () => void }) {
  const id = useId();
  const [context, setContext] = useState<ControlContext>('offense');
  const [device, setDevice] = useState<InputDevice>('gamepad');
  const [preferredPad, setPreferredPad] = useState(0);
  const profile = useControlSettingsStore((state) => state.profile);
  const pads = useGamepadMonitor();
  const selectedPad = pads.find((pad) => pad.index === preferredPad) ?? pads[0];
  const neutral = getPadNeutral(profile, selectedPad ?? null);
  const capture = useControlCapture(context, device, selectedPad?.index, profile.deadzone);
  const bindings = profile[context];
  const actions = CONTROL_ACTIONS.filter(
    (action) =>
      !(context === 'defense' && action.startsWith('HAND_')) &&
      !(device === 'gamepad' && action.startsWith('HAND_')) &&
      !(action.startsWith('SKILL_') && device !== 'gamepad') &&
      !(device === 'mobile' && action.startsWith('MOVE_')),
  );
  const currentBinding = (action: ControlAction) =>
    device === 'keyboard'
      ? bindings.keyboard[action].map(keyLabel).join(' / ')
      : device === 'gamepad'
        ? bindingLabel(bindings.gamepad[action])
        : TOUCH_SLOTS.filter((slot) => bindings.mobile[slot] === action)
            .map((slot) => TOUCH_GLYPHS[slot])
            .join(' / ') || 'Nije dodeljeno';

  return (
    <section className="full-panel controls-panel" aria-labelledby={`${id}-title`}>
      <div className="controls-shell">
        <header className="controls-header">
          <div>
            <span className="eyebrow">YOUR GAME · YOUR CONTROLS</span>
            <h2 id={`${id}-title`}>
              KONTROLE<span>.</span>
            </h2>
          </div>
          <button
            type="button"
            className="controls-back"
            onClick={() => {
              capture.cancel();
              onBack();
            }}
          >
            ← NAZAD
          </button>
        </header>
        <p className="controls-intro">
          Izaberi fazu igre i uređaj. Klikni akciju, pa pritisni svoju komandu.
        </p>
        <div className="controls-tabs" role="tablist" aria-label="Faza igre">
          {CONTEXTS.map((value) => (
            <button
              type="button"
              role="tab"
              key={value}
              id={`${id}-tab-${value}`}
              aria-selected={context === value}
              aria-controls={`${id}-context-${value}`}
              tabIndex={context === value ? 0 : -1}
              onKeyDown={navigateTabs}
              onClick={() => {
                capture.cancel();
                setContext(value);
              }}
            >
              {TITLES[value]}
            </button>
          ))}
        </div>
        <div
          role="tabpanel"
          id={`${id}-context-${context}`}
          aria-labelledby={`${id}-tab-${context}`}
        >
          <div className="controls-tabs controls-device-tabs" role="tablist" aria-label="Uređaj">
            {DEVICES.map((value) => (
              <button
                type="button"
                role="tab"
                key={value}
                id={`${id}-tab-${value}`}
                aria-selected={device === value}
                aria-controls={`${id}-device-${value}`}
                tabIndex={device === value ? 0 : -1}
                onKeyDown={navigateTabs}
                onClick={() => {
                  capture.cancel();
                  setDevice(value);
                }}
              >
                {TITLES[value]}
              </button>
            ))}
          </div>
          <div
            role="tabpanel"
            id={`${id}-device-${device}`}
            aria-labelledby={`${id}-tab-${device}`}
            className="controls-content"
          >
            <div className="controls-feedback" role="status" aria-live="polite">
              <span>{capture.message}</span>
              {capture.action && (
                <button type="button" onClick={capture.cancel}>
                  OTKAŽI
                </button>
              )}
            </div>
            <div className="controls-columns">
              <div className="controls-actions" aria-label="Mapiranje akcija">
                {device === 'mobile' && (
                  <p className="controls-note">
                    Kretanje: leva virtuelna palica. Njena pozicija i smerovi ostaju isti.
                  </p>
                )}
                {device === 'gamepad' && context === 'offense' && (
                  <p className="controls-note">
                    Desna palica prati položaj tela i pogled kamere: bočno dribling ili crossover,
                    napred brzi crossoveri, nazad iza leđa. Za smerove dodeli samo Axis.
                  </p>
                )}
                {device === 'gamepad' && context === 'defense' && (
                  <p className="controls-note">
                    Desna palica prati telo i kameru: levo/desno otvara ruku dlanom napred, napred
                    podiže obe, dupli napred maše. Nazad postavlja podlaktice na protivnika, dupli
                    nazad odguruje. Između poteza vrati palicu u neutralu. Dodeli Axis.
                  </p>
                )}
                {actions.map((action) => (
                  <button
                    type="button"
                    key={action}
                    className={`controls-action${capture.action === action ? ' controls-action--learning' : ''}`}
                    data-control-action={action}
                    aria-pressed={capture.action === action}
                    onClick={() => capture.arm(action)}
                  >
                    <span>{ACTION_LABELS[context][action]}</span>
                    <strong>{capture.action === action ? '…' : currentBinding(action)}</strong>
                  </button>
                ))}
              </div>
              <aside className="controls-device-info" aria-label="Pregled uređaja">
                {device === 'gamepad' && (
                  <>
                    <label className="controls-select-label">
                      Kontroler za podešavanje
                      <select
                        value={selectedPad?.index ?? ''}
                        onChange={(event) => {
                          capture.cancel();
                          setPreferredPad(Number(event.target.value));
                        }}
                        disabled={!pads.length || !!capture.action}
                      >
                        {!pads.length && <option value="">Nema povezanog kontrolera</option>}
                        {pads.map((pad) => (
                          <option value={pad.index} key={pad.index}>
                            {pad.index + 1} · {pad.id}
                          </option>
                        ))}
                      </select>
                    </label>
                    {selectedPad ? (
                      <>
                        <p className="controls-pad-name">{selectedPad.id}</p>
                        <p className="controls-note">
                          Browser mapa: {selectedPad.mapping || 'nestandardna'}. Veze važe za oba
                          kontrolera.
                        </p>
                        <p className="controls-note">
                          Pusti sva dugmad i palice, pa sačuvaj neutralni položaj ovog kontrolera.
                        </p>
                        <button
                          type="button"
                          className="controls-back"
                          disabled={!!capture.action}
                          onClick={() => {
                            const pad = navigator.getGamepads?.()[selectedPad.index];
                            const saved =
                              pad?.connected &&
                              useControlSettingsStore.getState().calibratePad(pad);
                            capture.finish(
                              saved ? 'Neutralni položaj je sačuvan.' : 'Kontroler nije dostupan.',
                            );
                          }}
                        >
                          Kalibriši neutralni položaj
                        </button>
                        <div className="controls-axes" aria-label="Ose kontrolera">
                          {selectedPad.axes.map((value, index) => (
                            <span
                              key={index}
                              className={
                                Math.abs(value - (neutral?.[index] ?? 0)) > profile.deadzone
                                  ? 'controls-input--active'
                                  : ''
                              }
                            >
                              Axis {index}
                              <b>{value.toFixed(2)}</b>
                            </span>
                          ))}
                        </div>
                        <div className="controls-buttons" aria-label="Dugmad kontrolera">
                          {selectedPad.buttons.map((button, index) => (
                            <span
                              key={index}
                              className={
                                button.pressed || button.value > 0.5 ? 'controls-input--active' : ''
                              }
                              title={`Button ${index}: ${button.value.toFixed(2)}`}
                            >
                              {index}
                            </span>
                          ))}
                        </div>
                      </>
                    ) : (
                      <p className="controls-note">
                        Poveži kontroler i pritisni bilo koje dugme da ga pregledač prepozna.
                      </p>
                    )}
                    <label className="controls-deadzone">
                      Deadzone <output>{Math.round(profile.deadzone * 100)}%</output>
                      <input
                        aria-label="Gamepad deadzone"
                        type="range"
                        min="0.05"
                        max="0.4"
                        step="0.01"
                        value={profile.deadzone}
                        disabled={!!capture.action}
                        onChange={(event) =>
                          useControlSettingsStore.getState().setDeadzone(Number(event.target.value))
                        }
                      />
                    </label>
                    <p className="controls-note">
                      Vrati desnu palicu u sredinu između poteza. Dva brza povlačenja nazad daju
                      seriju iza leđa. Pun otklon leve palice tokom ovih poteza nosi 90% rizika od
                      gubitka kontrole lopte.
                    </p>
                  </>
                )}
                {device === 'keyboard' && (
                  <>
                    <h3>PRITISNI I SAČUVAJ</h3>
                    <p className="controls-note">
                      Posle izbora akcije pritisni željeni taster. Zauzeta veza se preraspoređuje;
                      proveri listu posle promene.
                    </p>
                    <p className="controls-note">
                      Esc uvek ostaje dostupan za pauzu. Tokom podešavanja Esc odustaje.
                    </p>
                  </>
                )}
                {device === 'mobile' && (
                  <>
                    <h3>DODIRNI DUGME</h3>
                    <p className="controls-note">
                      Izaberi akciju na listi, pa dodirni fizičko dugme u ovom prikazu.
                    </p>
                    <div className="controls-touch-map" aria-label="Mobilna dugmad">
                      {TOUCH_SLOTS.map((slot) => (
                        <button
                          type="button"
                          key={slot}
                          className={`controls-touch controls-touch--${slot}`}
                          disabled={!capture.action}
                          aria-label={`Dodeli ${slot}`}
                          onClick={() => capture.bindTouch(slot)}
                        >
                          {TOUCH_GLYPHS[slot]}
                          <small>
                            {bindings.mobile[slot]
                              ? ACTION_LABELS[context][bindings.mobile[slot]].split(' · ')[0]
                              : 'Slobodno'}
                          </small>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </aside>
            </div>
          </div>
        </div>
        <footer className="controls-footer">
          <span>Pamti se u ovom pregledaču · odvojeno za napad i odbranu</span>
          <button
            type="button"
            onClick={() => {
              capture.cancel();
              useControlSettingsStore.getState().resetBindings();
              capture.finish('Vraćene su podrazumevane kontrole.');
            }}
          >
            VRATI PODRAZUMEVANO
          </button>
        </footer>
      </div>
    </section>
  );
}
