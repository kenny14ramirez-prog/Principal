# Vale styles

Instalar Vale: https://vale.sh/docs/install/

Ejecutar:
  cd docs-site
  vale sync
  vale ../docs/maps/*.md

Configuración: .vale.ini (StylesPath = styles, MinAlertLevel = suggestion).
Paquetes: Microsoft, write-good (descargados por `vale sync`).
Vocabulario personalizado: styles/Vocab/Crozzo/accept.txt
