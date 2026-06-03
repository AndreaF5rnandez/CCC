# Presupuestador de Obras

Sistema web para presupuestación y control de costos de obras de construcción desarrollado con Next.js, TypeScript y PostgreSQL (Supabase).

## Descripción

El objetivo del proyecto es digitalizar el proceso de análisis de costos y generación de presupuestos de obra, permitiendo gestionar materiales, mano de obra, equipos, análisis de precios unitarios, mediciones y presupuestos finales desde una única plataforma.

El sistema está diseñado para constructoras, estudios técnicos, arquitectos e ingenieros que necesiten calcular costos de manera rápida, trazable y reutilizable.

## Problema que resuelve

En muchos proyectos de construcción los presupuestos se realizan mediante planillas de cálculo dispersas, generando problemas como:

* Duplicación de información.
* Errores manuales de cálculo.
* Dificultad para reutilizar análisis de precios.
* Falta de trazabilidad sobre cambios de costos.
* Escaso control sobre mediciones y presupuestos.

Este sistema centraliza toda la información y automatiza los cálculos necesarios para generar presupuestos confiables.

## Funcionalidades principales

### Gestión de Insumos

* Alta, modificación y eliminación de materiales.
* Gestión de mano de obra.
* Gestión de equipos.
* Clasificación por tipo.
* Administración de precios unitarios.

### Gestión de Recetas (APU)

* Creación de análisis de precio unitario.
* Asociación de múltiples insumos.
* Cálculo automático del costo unitario.
* Reutilización de recetas en distintas obras.

### Gestión de Obras

* Administración de proyectos.
* Información de cliente.
* Estado de avance de la obra.
* Fechas de inicio y seguimiento.

### Mediciones

* Registro de cantidades ejecutadas.
* Cálculo automático mediante dimensiones.
* Asociación directa con recetas.
* Trazabilidad por obra.

### Presupuestos

* Agrupación automática de mediciones.
* Cálculo de subtotales.
* Aplicación de gastos generales.
* Aplicación de beneficio.
* Aplicación de impuestos.
* Generación de presupuesto final.

## Arquitectura

Frontend:

* Next.js 14
* React
* TypeScript
* Tailwind CSS

Backend:

* Next.js Route Handlers
* TypeScript

Base de Datos:

* PostgreSQL
* Supabase

## Modelo de Datos

Tablas principales:

* insumos
* recetas
* receta_insumos
* obras
* mediciones

## Estado del Proyecto

Actualmente en desarrollo.

Módulos implementados:

* Base de datos PostgreSQL
* Conexión con Supabase
* Tipos TypeScript
* Lógica de cálculo
* API de Insumos
* API de Recetas

Próximos módulos:

* API de Obras
* API de Mediciones
* API de Presupuestos
* Hooks de datos
* Interfaz de usuario completa
* Sistema de autenticación
* Control de acceso por usuario

## Instalación

Clonar el repositorio:

```bash
git clone <url-del-repositorio>
```

Instalar dependencias:

```bash
npm install
```

Crear archivo de entorno:

```env
NEXT_PUBLIC_SUPABASE_URL=tu_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=tu_clave
```

Ejecutar en desarrollo:

```bash
npm run dev
```

La aplicación estará disponible en:

```text
http://localhost:3000
```

## Objetivo a Futuro

Convertir la plataforma en una solución integral para presupuestación, control de costos y seguimiento económico de proyectos de construcción, incorporando análisis de desvíos, reportes ejecutivos y monitoreo en tiempo real.
