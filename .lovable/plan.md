## Objetivo
Adicionar um botão pequeno no cabeçalho do card **Iniciativas** que, ao clicar, abre um modal/dialog mostrando a mesma lista de iniciativas com mais itens visíveis simultaneamente.

## O que será alterado
Arquivo: `src/routes/index.tsx`

## Implementação
1. **Estado local no `IniciativasCard`**
   - Adicionar `const [isOpen, setIsOpen] = useState(false)`.

2. **Botão de expandir no cabeçalho**
   - Posicionar no canto direito do título "Iniciativas".
   - Usar ícone `Maximize2` (já importado) com tamanho pequeno (`w-6 h-6` ou `p-1`).
   - Estilo discreto: botão ghost com cor neutra, hover leve.
   - `aria-label="Expandir iniciativas"`.

3. **Extrair lista para componente reutilizável**
   - Criar `IniciativasList({ data, className? })` que renderiza a lista atual (incluindo estado vazio e animações).
   - Reutilizar dentro do card compacto e dentro do dialog expandido.

4. **Modal expandido**
   - Usar o componente `Dialog` já disponível no projeto (`@/components/ui/dialog`).
   - Título do dialog: "Iniciativas".
   - Conteúdo: `IniciativasList` sem altura máxima restrita, ocupando a altura disponível do viewport (`max-h-[80vh]` ou similar).
   - Largura adequada: `max-w-3xl` ou `max-w-4xl` para aproveitar o espaço.
   - Fechar ao clicar fora, pressionar ESC ou via botão X no header do dialog.

5. **Card compacto inalterado em comportamento**
   - Mantém a altura fixa (`h-[480px] md:h-full`) e scroll interno.
   - A lista continua animada com `useCountUp` quando os filtros mudam.

## Critérios de aceitação
- Botão de expandir visível apenas no card de Iniciativas.
- Clique abre modal centralizado com a lista completa.
- Modal mostra mais itens visíveis sem scroll excessivo.
- Filtros continuam refletindo nos dados do modal (usa mesma `data`).
- Animações de contagem e barras continuam funcionando ao trocar filtros.
- Layout mobile: modal ocupa quase toda a tela (`max-w-full` em telas pequenas) e permite scroll vertical.

## Não inclui
- Alterações em outros cards.
- Novas informações ou gráficos por iniciativa.
- Backend ou mudança na estrutura de dados.