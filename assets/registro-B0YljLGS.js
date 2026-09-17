import { r as React, j as jsx, L as Link } from "./index-CDcar1Cx.js";

const EMPTY_FORM = {
  firstName: "",
  lastName: "",
  team: "",
  isMember: false,
  memberNumber: "",
  hasContact: false,
  contactType: "",
  contact: ""
};

const CONTACT_TYPES = [
  { value: "whatsapp", label: "WhatsApp" },
  { value: "instagram", label: "Instagram" },
  { value: "facebook", label: "Facebook" }
];

function Toggle({ checked, onToggle, label }) {
  return jsx.jsxs("label", {
    className: "flex items-center gap-2 cursor-pointer select-none",
    style: { fontSize: 15, color: "rgba(255,255,255,0.9)" },
    children: [
      jsx.jsx("input", {
        type: "checkbox",
        checked,
        onChange: (event) => onToggle(event.target.checked),
        style: { width: 18, height: 18, accentColor: "#e10600" }
      }),
      label
    ]
  });
}

function ContactFields({ form, onChange }) {
  const placeholder =
    form.contactType === "whatsapp"
      ? "+506 8888-8888"
      : form.contactType === "instagram"
        ? "@usuario"
        : form.contactType === "facebook"
          ? "Nombre o enlace del perfil"
          : "Selecciona primero el medio";

  return jsx.jsxs("div", {
    className: "grid gap-3",
    children: [
      jsx.jsxs("div", {
        children: [
          jsx.jsx("label", { className: "field", children: "Medio de contacto" }),
          jsx.jsxs("select", {
            className: "input",
            value: form.contactType,
            onChange: onChange("contactType"),
            required: true,
            children: [
              jsx.jsx("option", { value: "", children: "Seleccionar…" }),
              CONTACT_TYPES.map((type) =>
                jsx.jsx("option", { value: type.value, children: type.label }, type.value)
              )
            ]
          })
        ]
      }),
      jsx.jsxs("div", {
        children: [
          jsx.jsx("label", {
            className: "field",
            children: form.contactType === "whatsapp" ? "Número de WhatsApp" : "Usuario o perfil"
          }),
          jsx.jsx("input", {
            className: "input",
            value: form.contact,
            onChange: onChange("contact"),
            placeholder,
            autoComplete: form.contactType === "whatsapp" ? "tel" : "off",
            inputMode: form.contactType === "whatsapp" ? "tel" : "text",
            required: true
          })
        ]
      })
    ]
  });
}

function Registration() {
  const [form, setForm] = React.useState(EMPTY_FORM);
  const [submitting, setSubmitting] = React.useState(false);
  const [completed, setCompleted] = React.useState(false);
  const [error, setError] = React.useState(null);
  const onChange = (field) => (event) =>
    setForm((current) => ({ ...current, [field]: event.target.value }));

  const toggleContact = (enabled) =>
    setForm((current) => ({
      ...current,
      hasContact: enabled,
      contactType: enabled ? current.contactType : "",
      contact: enabled ? current.contact : ""
    }));

  const submit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/participants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: form.firstName,
          lastName: form.lastName,
          team: form.team,
          isMember: form.isMember,
          memberNumber: form.isMember ? form.memberNumber : "",
          hasContact: form.hasContact,
          contactType: form.hasContact ? form.contactType : "",
          contact: form.hasContact ? form.contact : "",
          source: "public"
        })
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${response.status}`);
      }
      setCompleted(true);
    } catch (reason) {
      setError(reason?.message ?? "No pudimos completar la inscripción");
    } finally {
      setSubmitting(false);
    }
  };

  return jsx.jsxs("div", {
    className: "min-h-screen bg-radial-spot flex flex-col items-center px-5 py-10",
    children: [
      jsx.jsxs("div", {
        className: "w-full",
        style: { maxWidth: 480 },
        children: [
          jsx.jsxs("div", {
            className: "flex flex-col items-center gap-3 mb-7",
            children: [
              jsx.jsx("img", {
                src: "/assets/logo-vm.png",
                alt: "Virtual Motors",
                style: { height: 44, display: "block" }
              }),
              jsx.jsx("p", {
                className: "tag",
                style: { color: "#e10600" },
                children: "Time Attack · Inscripción"
              }),
              jsx.jsx("h1", {
                className: "font-display text-white text-center",
                style: {
                  fontSize: 28,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  fontWeight: 700,
                  lineHeight: 1.1
                },
                children: "Inscribirme a la fila virtual"
              })
            ]
          }),
          completed
            ? jsx.jsxs("div", {
                className: "panel-strong fade-in-up text-center",
                style: { padding: 28 },
                children: [
                  jsx.jsx("div", {
                    className: "mx-auto mb-4 flex items-center justify-center",
                    style: {
                      width: 56,
                      height: 56,
                      borderRadius: 999,
                      background: "rgba(31,139,93,0.2)",
                      border: "1px solid #1f8b5d",
                      fontSize: 26
                    },
                    children: "✓"
                  }),
                  jsx.jsx("p", {
                    className: "font-display text-white",
                    style: { fontSize: 22, letterSpacing: "0.04em", textTransform: "uppercase" },
                    children: "Inscripción recibida"
                  }),
                  jsx.jsxs("p", {
                    className: "text-white/80 mt-3",
                    style: { fontSize: 15 },
                    children: ["Estás en la fila virtual.", jsx.jsx("br", {}), "Esperá el llamado en pantalla."]
                  }),
                  jsx.jsx("p", {
                    className: "text-white/50 mt-4",
                    style: { fontSize: 13 },
                    children: "Gracias por ser parte de Virtual Motors."
                  }),
                  jsx.jsxs("div", {
                    className: "flex flex-col gap-3 mt-6",
                    children: [
                      jsx.jsx("button", {
                        type: "button",
                        className: "btn-ghost",
                        onClick: () => {
                          setForm(EMPTY_FORM);
                          setCompleted(false);
                        },
                        children: "Inscribir otro piloto"
                      }),
                      jsx.jsx(Link, {
                        to: "/",
                        className: "text-white/40 text-xs hover:text-white/70",
                        children: "Ver el dashboard"
                      })
                    ]
                  })
                ]
              })
            : jsx.jsxs("form", {
                onSubmit: submit,
                className: "panel grid gap-4",
                style: { padding: 22 },
                children: [
                  jsx.jsxs("div", {
                    className: "grid grid-cols-2 gap-3",
                    children: [
                      jsx.jsxs("div", {
                        children: [
                          jsx.jsx("label", { className: "field", children: "Nombre" }),
                          jsx.jsx("input", {
                            className: "input",
                            value: form.firstName,
                            onChange: onChange("firstName"),
                            autoComplete: "given-name",
                            required: true
                          })
                        ]
                      }),
                      jsx.jsxs("div", {
                        children: [
                          jsx.jsx("label", { className: "field", children: "Apellido" }),
                          jsx.jsx("input", {
                            className: "input",
                            value: form.lastName,
                            onChange: onChange("lastName"),
                            autoComplete: "family-name",
                            required: true
                          })
                        ]
                      })
                    ]
                  }),
                  jsx.jsxs("div", {
                    children: [
                      jsx.jsx("label", { className: "field", children: "Escudería" }),
                      jsx.jsx("input", {
                        className: "input",
                        value: form.team,
                        onChange: onChange("team"),
                        autoComplete: "off",
                        required: true
                      })
                    ]
                  }),
                  jsx.jsxs("div", {
                    className: "grid gap-3 pt-1",
                    children: [
                      jsx.jsx(Toggle, {
                        checked: form.isMember,
                        onToggle: (enabled) =>
                          setForm((current) => ({ ...current, isMember: enabled })),
                        label: "Soy socio"
                      }),
                      form.isMember &&
                        jsx.jsxs("div", {
                          children: [
                            jsx.jsx("label", { className: "field", children: "Número de socio" }),
                            jsx.jsx("input", {
                              className: "input",
                              value: form.memberNumber,
                              onChange: onChange("memberNumber"),
                              autoComplete: "off",
                              required: true
                            })
                          ]
                        }),
                      jsx.jsx(Toggle, {
                        checked: form.hasContact,
                        onToggle: toggleContact,
                        label: "Quiero dejar un contacto"
                      }),
                      form.hasContact && jsx.jsx(ContactFields, { form, onChange })
                    ]
                  }),
                  error && jsx.jsx("p", { className: "text-red-400 text-sm", role: "alert", children: error }),
                  jsx.jsx("button", {
                    type: "submit",
                    className: "btn-primary",
                    style: { width: "100%", justifyContent: "center" },
                    disabled: submitting,
                    children: submitting ? "Enviando…" : "Inscribirme"
                  }),
                  jsx.jsx(Link, {
                    to: "/",
                    className: "text-white/40 text-xs hover:text-white/70 text-center",
                    children: "Volver al dashboard"
                  })
                ]
              })
        ]
      }),
      jsx.jsx("p", {
        className: "tag text-white/40 mt-10",
        style: { letterSpacing: "0.32em", fontSize: 10 },
        children: "Powered by Virtual Motors"
      })
    ]
  });
}

export { Registration as component };
