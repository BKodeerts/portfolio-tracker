
// this file is generated — do not edit it


declare module "svelte/elements" {
	export interface HTMLAttributes<T> {
		'data-sveltekit-keepfocus'?: true | '' | 'off' | undefined | null;
		'data-sveltekit-noscroll'?: true | '' | 'off' | undefined | null;
		'data-sveltekit-preload-code'?:
			| true
			| ''
			| 'eager'
			| 'viewport'
			| 'hover'
			| 'tap'
			| 'off'
			| undefined
			| null;
		'data-sveltekit-preload-data'?: true | '' | 'hover' | 'tap' | 'off' | undefined | null;
		'data-sveltekit-reload'?: true | '' | 'off' | undefined | null;
		'data-sveltekit-replacestate'?: true | '' | 'off' | undefined | null;
	}
}

export {};


declare module "$app/types" {
	type MatcherParam<M> = M extends (param : string) => param is (infer U extends string) ? U : string;

	export interface AppTypes {
		RouteId(): "/" | "/analysis" | "/bonus" | "/bonus/[id]" | "/import" | "/intraday" | "/settings" | "/stock" | "/stock/[ticker]" | "/transactions";
		RouteParams(): {
			"/bonus/[id]": { id: string };
			"/stock/[ticker]": { ticker: string }
		};
		LayoutParams(): {
			"/": { id?: string; ticker?: string };
			"/analysis": Record<string, never>;
			"/bonus": { id?: string };
			"/bonus/[id]": { id: string };
			"/import": Record<string, never>;
			"/intraday": Record<string, never>;
			"/settings": Record<string, never>;
			"/stock": { ticker?: string };
			"/stock/[ticker]": { ticker: string };
			"/transactions": Record<string, never>
		};
		Pathname(): "/" | "/analysis" | "/bonus" | `/bonus/${string}` & {} | "/import" | "/intraday" | "/settings" | `/stock/${string}` & {} | "/transactions";
		ResolvedPathname(): `${"" | `/${string}`}${ReturnType<AppTypes['Pathname']>}`;
		Asset(): "/portfolio-card.js" | string & {};
	}
}