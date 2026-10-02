import { Routes } from '@angular/router';
import { App } from './app';

export const routes: Routes = [
	{ path: '', redirectTo: 'csr', pathMatch: 'full' },
	{ path: 'csr', component: App, data: { renderingMode: 'CSR' } },
	{ path: 'ssr', component: App, data: { renderingMode: 'SSR' } },
	{ path: '**', redirectTo: 'csr' },
];
