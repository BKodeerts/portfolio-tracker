export const manifest = (() => {
function __memo(fn) {
	let value;
	return () => value ??= (value = fn());
}

return {
	appDir: "_app",
	appPath: "_app",
	assets: new Set(["portfolio-card.js"]),
	mimeTypes: {".js":"text/javascript"},
	_: {
		client: {start:"_app/immutable/entry/start.DGYxft3P.js",app:"_app/immutable/entry/app.CPMivWyO.js",imports:["_app/immutable/entry/start.DGYxft3P.js","_app/immutable/chunks/DzSi-rgU.js","_app/immutable/chunks/Bpfdnexl.js","_app/immutable/chunks/BXpyhBrx.js","_app/immutable/chunks/CSGOvlfF.js","_app/immutable/entry/app.CPMivWyO.js","_app/immutable/chunks/CEWIRRa7.js","_app/immutable/chunks/Bpfdnexl.js","_app/immutable/chunks/CXH28_OG.js","_app/immutable/chunks/CSGOvlfF.js","_app/immutable/chunks/B0ETMeTh.js","_app/immutable/chunks/BSPHWbet.js","_app/immutable/chunks/BXpyhBrx.js"],stylesheets:[],fonts:[],uses_env_dynamic_public:false},
		nodes: [
			__memo(() => import('./nodes/0.js')),
			__memo(() => import('./nodes/1.js')),
			__memo(() => import('./nodes/2.js')),
			__memo(() => import('./nodes/3.js')),
			__memo(() => import('./nodes/4.js')),
			__memo(() => import('./nodes/5.js')),
			__memo(() => import('./nodes/6.js')),
			__memo(() => import('./nodes/7.js')),
			__memo(() => import('./nodes/8.js')),
			__memo(() => import('./nodes/9.js')),
			__memo(() => import('./nodes/10.js'))
		],
		remotes: {
			
		},
		routes: [
			{
				id: "/",
				pattern: /^\/$/,
				params: [],
				page: { layouts: [0,], errors: [1,], leaf: 2 },
				endpoint: null
			},
			{
				id: "/analysis",
				pattern: /^\/analysis\/?$/,
				params: [],
				page: { layouts: [0,], errors: [1,], leaf: 3 },
				endpoint: null
			},
			{
				id: "/bonus",
				pattern: /^\/bonus\/?$/,
				params: [],
				page: { layouts: [0,], errors: [1,], leaf: 4 },
				endpoint: null
			},
			{
				id: "/bonus/[id]",
				pattern: /^\/bonus\/([^/]+?)\/?$/,
				params: [{"name":"id","optional":false,"rest":false,"chained":false}],
				page: { layouts: [0,], errors: [1,], leaf: 5 },
				endpoint: null
			},
			{
				id: "/import",
				pattern: /^\/import\/?$/,
				params: [],
				page: { layouts: [0,], errors: [1,], leaf: 6 },
				endpoint: null
			},
			{
				id: "/intraday",
				pattern: /^\/intraday\/?$/,
				params: [],
				page: { layouts: [0,], errors: [1,], leaf: 7 },
				endpoint: null
			},
			{
				id: "/settings",
				pattern: /^\/settings\/?$/,
				params: [],
				page: { layouts: [0,], errors: [1,], leaf: 8 },
				endpoint: null
			},
			{
				id: "/stock/[ticker]",
				pattern: /^\/stock\/([^/]+?)\/?$/,
				params: [{"name":"ticker","optional":false,"rest":false,"chained":false}],
				page: { layouts: [0,], errors: [1,], leaf: 9 },
				endpoint: null
			},
			{
				id: "/transactions",
				pattern: /^\/transactions\/?$/,
				params: [],
				page: { layouts: [0,], errors: [1,], leaf: 10 },
				endpoint: null
			}
		],
		prerendered_routes: new Set([]),
		matchers: async () => {
			
			return {  };
		},
		server_assets: {}
	}
}
})();
