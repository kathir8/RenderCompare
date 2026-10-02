import { BootstrapContext, bootstrapApplication } from '@angular/platform-browser';
import { AppShellComponent } from './app/app-shell.component';
import { config } from './app/app.config.server';

const bootstrap = (context: BootstrapContext) =>
    bootstrapApplication(AppShellComponent, config, context);

export default bootstrap;
