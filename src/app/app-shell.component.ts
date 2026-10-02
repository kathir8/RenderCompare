import { ChangeDetectionStrategy, Component } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  templateUrl: './app-shell.component.html',
  styleUrl: './app-shell.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppShellComponent {
  constructor(private readonly router: Router) {}

  protected get isSsrRoute(): boolean {
    return this.router.url.startsWith('/ssr');
  }
}