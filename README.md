# Trading 📈

> **Gráficos cripto en vivo, gratis y sin login.**
> Velas en tiempo real con datos de Binance, indicadores propios y watchlist.

Plataforma de charts construida sobre los datos públicos de **Binance** (REST + WebSocket) y la librería de render [`lightweight-charts`](https://github.com/tradingview/lightweight-charts).

---

## ✨ Features

- 📊 **Velas en vivo** vía WebSocket de Binance (sin API key)
- 🔍 **Buscador de monedas** sobre todos los pares USDT del exchange
- 🗂️ **Dos vistas**: *VWAP* (VWAP + bandas, RSI, Stoch RSI) y *Normal* (medias móviles + Cipher WaveTrend); cada una recuerda sus indicadores
- ⏱️ **Temporalidades**: 15m · 1H · 2H · 3H · 4H · 1D, más 1m/5m/30m/1W en el desplegable (3H se arma a partir de velas de 1H, Binance no la ofrece)
- ⚡ **Tiempo real tick a tick**: el precio se mueve con cada trade (stream `aggTrade`), los indicadores se recalculan una vez por frame y los gráficos ya vistos abren al instante desde caché
- 📐 **Menú de indicadores** con interruptores y engranaje para editar cada uno
  - **Precio**: VWAP + bandas σ, Volumen, Medias móviles, Sesión Nueva York
  - **Osciladores**: RSI (con media y divergencias), Stoch RSI, Cipher WaveTrend (tipo VuManChu Cipher B con money flow, puntos de cruce, círculos de compra/venta/oro y divergencias)
  - **Más**: EMA, Estocástico, MACD, Bollinger, SuperTrend, Ichimoku
- 👁️ **Favoritos** del mercado activo con precio y cambio 24h en tiempo real
- 📱 **Móvil**: barra inferior Gráfico · Mercados · Indicadores · Herramientas · Más
- 💾 **Persistencia** en localStorage (símbolo, temporalidad, indicadores)
- 🔌 **Reconexión robusta** del WebSocket con backoff exponencial
- 🌐 100% client-side — deploy estático en Vercel/Cloudflare

## 🚀 Empezar

```bash
npm install
npm run dev
```

Abrí [http://localhost:3000](http://localhost:3000).

## 🛠️ Stack

| Capa | Tech |
|---|---|
| Framework | Next.js 16 (App Router) |
| Lenguaje | TypeScript |
| Estilos | Tailwind CSS 4 + shadcn/ui |
| Charts | [lightweight-charts](https://github.com/tradingview/lightweight-charts) v5 |
| Estado | Zustand (con persistencia) |
| Iconos | lucide-react |
| Datos | Binance Public REST + WebSocket |

## 📐 Arquitectura

```
src/
├── app/
│   ├── layout.tsx          # Root, fuente Inter, TooltipProvider, dark
│   ├── icon.svg            # Logo de Trading (favicon)
│   ├── page.tsx            # Dashboard armando el layout
│   └── globals.css         # Paleta oscura
├── components/
│   ├── brand/
│   │   ├── Logo.tsx           # Marca Trading
│   │   └── CoinIcon.tsx       # Iconos neutros de monedas
│   ├── chart/
│   │   ├── PriceChart.tsx     # Chart core (lightweight-charts + panes)
│   │   ├── SymbolSelector.tsx # Búsqueda de pares USDT
│   │   ├── TimeframeSelector.tsx
│   │   └── IndicatorMenu.tsx  # Precio / Osciladores / Más indicadores
│   ├── layout/
│   │   ├── Header.tsx         # Marca · vista · buscador · mercado · temporalidad · indicadores
│   │   ├── MobileTabBar.tsx   # Navegación inferior en el celular
│   │   ├── LeftSidebar.tsx    # Iconos drawing tools (visual)
│   │   └── RightSidebar.tsx
│   ├── header/
│   │   ├── LayoutSwitch.tsx   # VWAP / Normal
│   │   └── MarketSourceSelect.tsx
│   ├── watchlist/
│   │   └── Watchlist.tsx      # Favoritos del mercado activo
│   └── ui/                    # shadcn primitives
└── lib/
    ├── binance/
    │   ├── rest.ts            # klines / ticker / exchangeInfo
    │   ├── ws.ts              # WS multiplex + auto-reconnect
    │   └── types.ts
    ├── indicators/
    │   └── index.ts           # SMA, EMA, RSI (Wilder), MACD
    ├── store/
    │   └── chart-store.ts     # Zustand global state
    └── format.ts              # formatPrice / formatPct / formatVolume
```

## 🌐 Deploy a Vercel

```bash
npm i -g vercel
vercel
```

O conectá el repo en [vercel.com/new](https://vercel.com/new) y deploy automático. No hay variables de entorno — todo es cliente.

## 🧠 Cómo funciona

### Datos históricos
Al abrir un símbolo se hace un `GET /api/v3/klines` (REST) que trae las últimas **1000 velas** del par + timeframe activo. Se renderizan instantáneamente.

### Datos en vivo
Una única conexión WebSocket multiplexada (`stream.binance.com`) recibe:
- `<symbol>@kline_<interval>` → updates de la vela actual + cierre de velas
- `<symbol>@miniTicker` → tickers del watchlist

Al reconectarse (Binance corta el WS cada 24h) se vuelven a suscribir todos los streams activos con backoff exponencial.

### Indicadores
Se calculan **client-side** sobre el array de velas en cada update. Implementaciones puras de TypeScript:
- `EMA`: seeded con SMA del primer período, luego `close * k + prev * (1-k)`
- `RSI`: Wilder (suavizado exponencial sobre ganancias/pérdidas, período 14)
- `MACD`: EMA(12) − EMA(26), signal = EMA(9) sobre MACD line

Para 1000 velas y panes múltiples el costo es despreciable.

## ⚠️ Qué NO incluye (todavía)

- ❌ Pine Script (propietario de TradingView, no se puede clonar)
- ❌ Drawing tools persistentes (Fibo, trend lines arrastrables)
- ❌ Replay bar-by-bar
- ❌ Alertas server-side (siguiente video de la serie)
- ❌ Trading real (bot con API privada — video 4)

## 📺 Serie de videos

Este repo es la base de la serie **"Trading"**:

1. ✅ **Video 1 — Base**: lo que ves acá
2. 🔜 **Video 2 — Alertas**: Supabase + Telegram bot
3. 🔜 **Video 3 — Indicadores AI**: SuperTrend, Ichimoku, custom con Claude
4. 🔜 **Video 4 — Bot que opera**: API privada Binance + ejecución

## 📄 Licencia

MIT — usalo, forkealo, monetizalo, lo que quieras.

`lightweight-charts` es Apache 2.0 con atribución a TradingView — la atribución vive en el footer/UI por requerimiento de la licencia.
