import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ThemeService } from './services/theme.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent {
  // Injected so the theme (and its documentElement class) is applied as soon
  // as the app boots, rather than only once the authenticated shell loads.
  private theme = inject(ThemeService);
}
