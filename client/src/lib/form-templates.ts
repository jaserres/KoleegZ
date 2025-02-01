import { InsertVariable } from "@db/schema";

export interface FormTemplate {
  name: string;
  description: string;
  variables: Omit<InsertVariable, "id" | "formId">[];
}

export const formTemplates: FormTemplate[] = [
  {
    name: "Información Personal",
    description: "Plantilla básica para recolectar información personal",
    variables: [
      {
        name: "nombre",
        label: "Nombre Completo",
        type: "text",
      },
      {
        name: "fechaNacimiento",
        label: "Fecha de Nacimiento",
        type: "date",
      },
      {
        name: "email",
        label: "Correo Electrónico",
        type: "text",
      },
      {
        name: "telefono",
        label: "Número de Teléfono",
        type: "text",
      },
    ],
  },
  {
    name: "Facturación",
    description: "Plantilla para información de facturación",
    variables: [
      {
        name: "razonSocial",
        label: "Razón Social",
        type: "text",
      },
      {
        name: "rfc",
        label: "RFC",
        type: "text",
      },
      {
        name: "direccionFiscal",
        label: "Dirección Fiscal",
        type: "text",
      },
      {
        name: "metodoPago",
        label: "Método de Pago",
        type: "text",
      },
    ],
  },
  {
    name: "Encuesta de Satisfacción",
    description: "Plantilla para encuestas de satisfacción del cliente",
    variables: [
      {
        name: "calificacionServicio",
        label: "Calificación del Servicio (1-10)",
        type: "number",
      },
      {
        name: "comentarios",
        label: "Comentarios",
        type: "text",
      },
      {
        name: "recomendaria",
        label: "¿Recomendaría nuestro servicio?",
        type: "text",
      },
      {
        name: "fechaVisita",
        label: "Fecha de Visita",
        type: "date",
      },
    ],
  },
];
