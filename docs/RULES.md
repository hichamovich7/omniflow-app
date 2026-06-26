# RULES.md

# OmniFlow Development Rules

Este documento define las reglas obligatorias que todos los agentes IA (Claude Code, OpenCode, Cursor Agent, GPT, Gemini) deben respetar.

Estas reglas tienen prioridad sobre cualquier tarea individual.

---

# Rule #1 — Never Ignore Existing Documentation

Antes de escribir código, siempre leer:

```txt
PROJECT.md
ARCHITECTURE.md
DATABASE.md
API.md
UI_UX.md
TASKS.md
```

No asumir comportamiento que no esté documentado.

---

# Rule #2 — Only Work On The Active Task

Modificar únicamente los archivos necesarios para completar la tarea activa.

No refactorizar otras áreas.

No optimizar código no relacionado.

No realizar cambios "aprovechando que estamos aquí".

---

# Rule #3 — Never Modify Architecture Without Approval

No cambiar:

* Arquitectura
* Stack tecnológico
* Estructura de carpetas
* Flujo de datos

sin aprobación explícita.

Ejemplos prohibidos:

```txt
Cambiar Supabase por Prisma
Cambiar OpenRouter por OpenAI directo
Cambiar Inngest por cron jobs
Cambiar Next.js por otra tecnología
```

---

# Rule #4 — Never Modify Database Without Updating DATABASE.md

Si se crea:

* Tabla
* Columna
* Índice
* Relación

debe actualizarse inmediatamente:

```txt
DATABASE.md
```

---

# Rule #5 — Authentication Required

Toda API privada debe verificar:

```txt
Usuario autenticado
```

Patrón obligatorio:

```txt
1. Validar sesión
2. Validar ownership
3. Ejecutar lógica
4. Devolver respuesta
```

---

# Rule #6 — Ownership Validation Mandatory

Nunca confiar en IDs enviados por el cliente.

Siempre verificar que el recurso pertenece al usuario autenticado.

Ejemplo:

```txt
project.user_id === auth.uid()
```

---

# Rule #7 — RLS Mandatory

Todas las tablas de usuario deben tener:

```txt
Row Level Security
```

No desactivar RLS.

No usar service_role fuera de procesos controlados.

---

# Rule #8 — Credits Validation First

Toda operación que consuma créditos debe:

```txt
1. Verificar saldo
2. Ejecutar acción
3. Registrar transacción
4. Actualizar balance
```

Nunca ejecutar IA antes de validar créditos.

---

# Rule #9 — No Direct Provider Calls

Los componentes UI nunca llaman directamente a:

```txt
OpenRouter
OpenAI
Stripe
Supabase Admin
```

Flujo obligatorio:

```txt
UI
↓
API Route
↓
Business Logic
↓
Provider
```

---

# Rule #10 — OpenRouter Is The Only AI Gateway

Todos los modelos de texto y visión deben pasar por:

```txt
/lib/openrouter
```

No llamar directamente a:

```txt
OpenAI
Anthropic
Gemini
DeepSeek
```

desde otras partes del proyecto.

---

# Rule #11 — OpenRouter Is The Only Text/Vision AI Provider

Toda IA de texto y vision debe pasar por OpenRouter.

Incluye:

- Text Generation
- Vision Analysis

Excepcion documentada: Image Generation usa OpenAI directamente (gpt-image-1) porque OpenRouter no soporta /v1/images/generations. Ver DECISIONS.md.

---

# Rule #12 — Strong Typing Required

TypeScript estricto obligatorio.

Prohibido:

```ts
any
```

Siempre crear tipos explícitos.

Ubicación:

```txt
/types
```

---

# Rule #13 — Validate External Data

Toda entrada externa debe validarse.

Ejemplos:

* Request Body
* Query Params
* Webhooks
* OpenRouter Responses
* OpenAI Responses
* Stripe Responses

Utilizar:

```txt
Zod
```

---

# Rule #14 — No Business Logic In Components

Prohibido:

```txt
Llamadas IA
Validación créditos
Consultas complejas
Lógica de negocio
```

dentro de componentes React.

Los componentes solo muestran UI.

---

# Rule #15 — Async Jobs For Heavy Tasks (Deferred)

Procesos pesados deberan ejecutarse mediante jobs asincrono cuando se implemente.

El MVP actual usa generacion sincrona.

Inngest esta previsto pero no implementado.

---

# Rule #16 — Database First

Antes de crear nuevas funcionalidades:

Verificar:

```txt
DATABASE.md
```

No inventar tablas ni relaciones.

---

# Rule #17 — API First

Antes de crear frontend:

Verificar:

```txt
API.md
```

No inventar endpoints.

No inventar formatos de respuesta.

---

# Rule #18 — UI Must Follow UI_UX.md

No crear:

* Formularios nuevos
* Páginas nuevas
* Campos nuevos

que no estén definidos en:

```txt
UI_UX.md
```

---

# Rule #19 — Never Break Existing Features

Antes de modificar código existente:

Verificar impacto.

No eliminar funcionalidades funcionando.

No cambiar comportamiento sin justificación.

---

# Rule #20 — Reusable Components First

Antes de crear un nuevo componente:

Buscar si ya existe uno reutilizable.

Evitar duplicación.

---

# Rule #21 — Logging Required

Errores importantes deben registrarse.

No usar:

```js
console.log()
```

en producción.

Crear capa centralizada de logging.

---

# Rule #22 — Security First

Nunca almacenar:

* API Keys
* Secrets
* Tokens

en cliente.

Siempre usar:

```txt
Environment Variables
```

---

# Rule #23 — One Task = One Goal

Cada tarea debe tener:

* Objetivo claro
* Archivos afectados
* Criterio de éxito

No mezclar múltiples funcionalidades.

---

# Rule #24 — Ask When Unclear

Si existe ambigüedad:

No asumir.

Preguntar antes de implementar.

---

# Rule #25 — MVP Scope Protection

No implementar funcionalidades fuera del MVP actual.

Prohibido crear:

```txt
Pinterest OAuth
Pinterest API
Teams
Analytics Dashboard
Mobile App
```

hasta que aparezcan oficialmente en PROJECT.md.

WordPress y SEO Articles forman parte del roadmap oficial (ver TASKS.md). Solo implementar cuando la TASK correspondiente sea la tarea activa.

---

# Rule #26 — Frontend Standards Required

Antes de implementar cualquier cambio visual o crear un nuevo componente, revisar obligatoriamente:

```txt
docs/DESIGN_SYSTEM.md
docs/UI_PRINCIPLES.md
docs/COMPONENT_STANDARDS.md
```

No crear componentes ni modificar UI sin verificar estos documentos.

---

# Rule #27 — Reuse Before Create

Reutilizar componentes existentes antes de crear nuevos.

No duplicar componentes.

No duplicar estilos.

Antes de crear un nuevo componente, verificar si existe uno reutilizable que pueda adaptarse mediante props o variantes.

---

# Rule #28 — Visual Consistency

Mantener la coherencia visual en toda la aplicación.

No hardcodear:

```txt
Colores
Espaciados
Tamaños de fuente
Border radius
Sombras
```

Siempre usar los tokens del Design System.

---

# Rule #29 — Server Components Default

Server Components por defecto.

Client Components únicamente cuando exista interacción real del usuario.

Ejemplos de Client Components justificados:

```txt
Forms
Dialogs
Dropdowns
Search con debounce
Date Pickers
```

Ejemplos que deben ser Server Components:

```txt
Pages
Cards
Lists
Tables
Statistics
```

---

# Rule #30 — No Visual Libraries Without Justification

No introducir nuevas librerías visuales sin una justificación técnica documentada.

El stack visual autorizado es:

```txt
Tailwind CSS
Shadcn UI
Lucide React
Sonner
```

Cualquier adición debe aprobarse explícitamente y registrarse en DECISIONS.md.

---

# Rule #31 — Component Standards Compliance

Todo componente nuevo debe seguir las normas de:

```txt
DESIGN_SYSTEM.md → tokens visuales
COMPONENT_STANDARDS.md → implementación
```

Un componente no se considera completo hasta que cumple ambos documentos.

---
# Rule #32 Al finalizar cualquier TASK es obligatorio:

1. Actualizar TASKS.md.
2. Actualizar CHANGELOG.md.
3. Actualizar la documentación afectada.
4. Ejecutar TypeScript.
5. Ejecutar ESLint.
6. Ejecutar Production Build.
7. Entregar un resumen técnico de la implementación.

Una TASK no puede considerarse completada hasta que estos siete pasos se hayan realizado correctamente.

# Golden Rule

Si una decisión contradice cualquier documento del proyecto:

```txt
PROJECT.md
ARCHITECTURE.md
DATABASE.md
API.md
UI_UX.md
DESIGN_SYSTEM.md
UI_PRINCIPLES.md
COMPONENT_STANDARDS.md
```

detener la implementación y solicitar aclaración antes de continuar.
