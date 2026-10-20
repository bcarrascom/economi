# App Finanzas

Esta es una app domestica hecha para uso personal. No tiene la documentación y compatibilidad hecha con estandares industriales.

App de escritorio (Electron) para registrar ingresos, gastos, inversiones y una lista de compras, todo en CLP. Los datos se guardan como JSON en la carpeta que elijas (por ejemplo `OneDrive/app-finanzas`), así puedes usarla desde varios equipos.

## Instalar y ejecutar

```bash
npm install
npm start        # abre la app
npm run dev      # abre la app con DevTools
npm run dist     # genera instalador (electron-builder)
```

La primera vez te pedirá la carpeta de datos. Cada equipo recuerda su propia ruta, así que en el segundo equipo solo eliges la misma carpeta de OneDrive.

## Glosario (implementado en `src/js/calc.js`)

| Término | Cálculo |
|---|---|
| Neto | saldo inicial + ingresos − gastos (los aportes a inversiones externas cuentan como gasto) |
| Presupuesto de ahorro | ahorro inicial + aportes de ingresos + ajustes manuales − gastos pagados desde el ahorro |
| Bolsillo | neto − presupuesto de ahorro |
| Objetivo | suma de los ítems de ahorro en la lista de compras |
| Ideal teórico | suma de todos los ítems de la lista de compras |
| Coeficiente | ingresos − gastos del mes o del año |
| Reembolso | un gasto reembolsado cuenta como monto − reembolso; si el reembolso supera el monto, la diferencia cuenta como ingreso |
| Inversión externa | la plata sale de tu cuenta: aporte = gasto, retiro = ingreso; ganancias y pérdidas solo cambian la inversión |
| Inversión interna | la plata se mueve directo en tu cuenta: cada gasto es una pérdida y cada ingreso una ganancia |
| Saldo (externa) | aportes + ganancias − pérdidas − retiros: lo que realmente hay dentro |
| Monto (externa) | aportes + ganancias − pérdidas: lo que vale en teoría (retirar no lo cambia) |
| Resultado | ganancias − pérdidas; al completarla, la inversión se muestra verde o roja según su signo |

## Datos

```
app-finanzas/
├── movimientos.json   ingresos y gastos (los de una inversión llevan inversionId)
├── inversiones.json   inversiones + sus ganancias/pérdidas que no tocan tu cuenta
├── sueldos.json       sueldos (ingresos recurrentes) y subscripciones (cobros recurrentes)
├── compras.json       lista de compras
├── tags.json          tags (nombre + color)
├── ajustes.json       saldos iniciales, aporte por defecto, ajustes de ahorro
└── respaldos/         un respaldo diario, se conservan 14 días
```

Cada archivo tiene la forma `{ app, version, actualizado, data }`. Puedes agregar campos a mano: la app los conserva al guardar.

- Si un archivo está dañado, la app no lo sobrescribe y muestra un aviso.
- Si otro equipo modifica los archivos (vía OneDrive), la app recarga sola.
- Evita tener la app abierta y editando en los dos equipos al mismo tiempo: gana la última escritura de cada archivo.

## Estructura del código

```
main.js                  proceso principal: ventana, lectura/escritura atómica, watcher, respaldos
preload.js               puente seguro (window.api)
src/index.html
src/css/styles.css       tema, tablas, animaciones (variables en :root)
src/js/
├── app.js               arranque, navegación, pantalla de bienvenida
├── store.js             estado + persistencia + todas las mutaciones
├── calc.js              lógica financiera pura (sin DOM)
├── format.js            CLP, fechas, escala de color rojo→verde
├── icons.js             íconos SVG (reemplázalos por los tuyos)
├── ui.js                pills, switches, segmentados, modales, toasts, tooltips
├── charts.js            tema de Chart.js
├── forms/               formularios de movimiento, compra y tag
└── views/               dashboard, movimientos, progresión (mensual.js) con su pestaña de inversiones (+ página de cada una), compras, tags, ajustes
```

## Personalizar

- **Íconos:** en `src/js/icons.js` reemplaza el valor de cada clave por tu SVG, ya sea el `<svg>` completo o solo sus paths (viewBox 24×24). Usa `currentColor` para que hereden el color.
- **Colores de los números:** la sensibilidad de la escala rojo→verde de cada número del dashboard está en `puntajes()` de `calc.js`.
- **Paleta y tipografía:** variables CSS al inicio de `styles.css`.
- **Atajos:** `Ctrl/Cmd + N` crea un movimiento, `Enter` guarda un formulario y `Esc` lo cierra.
