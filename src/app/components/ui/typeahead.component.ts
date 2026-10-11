import { ChangeDetectionStrategy, Component, ElementRef, input, output, signal, viewChild } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';

export interface Suggestion {
  value: string;
  label: string;
  detail?: string;
}

/**
 * Text input with a suggestion list. The user can always type free text; picking a
 * suggestion additionally emits it so the parent can capture its code (ICD-10, RxNorm).
 * Arrow keys + Enter work; the parent supplies `search`.
 */
@Component({
  selector: 'app-typeahead',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule],
  template: `
    <div class="relative">
      <input
        #box
        class="input w-full"
        role="combobox"
        autocomplete="off"
        [attr.aria-expanded]="open()"
        [attr.aria-label]="label()"
        [attr.placeholder]="placeholder()"
        [formControl]="control()"
        (input)="onInput()"
        (keydown)="onKey($event)"
        (blur)="close()"
      />
      @if (open() && items().length) {
        <ul class="menu bg-base-100 rounded-box shadow-lg absolute z-30 mt-1 w-full max-h-60 overflow-auto flex-nowrap" role="listbox">
          @for (s of items(); track s.value; let i = $index) {
            <li role="option" [attr.aria-selected]="i === active()">
              <a [class.menu-active]="i === active()" (mousedown)="pick(s, $event)">
                <span>{{ s.label }}</span>
                @if (s.detail) {
                  <span class="text-xs opacity-60">{{ s.detail }}</span>
                }
              </a>
            </li>
          }
        </ul>
      }
    </div>
  `
})
export class TypeaheadComponent {
  control = input.required<FormControl<string | null>>();
  search = input.required<(term: string) => Promise<Suggestion[]>>();
  label = input('Search');
  placeholder = input('');
  selected = output<Suggestion>();
  /** Fires when the user edits the text after a pick, so the parent can drop the stale code. */
  edited = output<void>();

  protected items = signal<Suggestion[]>([]);
  protected open = signal(false);
  protected active = signal(0);
  box = viewChild.required<ElementRef<HTMLInputElement>>('box');

  private timer: ReturnType<typeof setTimeout> | null = null;
  private seq = 0;

  focus() {
    this.box().nativeElement.focus();
  }

  protected onInput() {
    this.edited.emit();
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(async () => {
      const mine = ++this.seq;
      const found = await this.search()(this.control().value ?? '').catch(() => []);
      if (mine !== this.seq) return; // a newer keystroke superseded this lookup
      this.items.set(found);
      this.active.set(0);
      this.open.set(found.length > 0);
    }, 200);
  }

  protected onKey(e: KeyboardEvent) {
    if (!this.open()) return;
    const n = this.items().length;
    if (e.key === 'ArrowDown') {
      this.active.set((this.active() + 1) % n);
      e.preventDefault();
    } else if (e.key === 'ArrowUp') {
      this.active.set((this.active() + n - 1) % n);
      e.preventDefault();
    } else if (e.key === 'Enter') {
      this.pick(this.items()[this.active()], e);
    } else if (e.key === 'Escape') {
      this.close();
    }
  }

  protected pick(s: Suggestion, e: Event) {
    e.preventDefault();
    this.seq++;
    this.control().setValue(s.label);
    this.selected.emit(s);
    this.close();
  }

  protected close() {
    this.open.set(false);
  }
}
