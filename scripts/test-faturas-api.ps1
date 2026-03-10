#!/usr/bin/env pwsh

# Script para testar a API de faturas
Write-Host "=== TESTE DA API DE FATURAS ===" -ForegroundColor Cyan

# Configurações
$baseUrl = "http://localhost:3000"
$debugUrl = "$baseUrl/api/faturas/debug"
$metricsUrl = "$baseUrl/api/faturas/metrics"

Write-Host "`n1. Testando endpoint de debug..." -ForegroundColor Yellow

try {
    $debugResponse = Invoke-RestMethod -Uri $debugUrl -Method GET -ContentType "application/json"
    
    Write-Host "✅ Debug API funcionando!" -ForegroundColor Green
    Write-Host "Total de registros: $($debugResponse.totalRegistros)" -ForegroundColor White
    Write-Host "Registros com cliente_cadastro: $($debugResponse.estatisticas.registrosComClienteCadastro)" -ForegroundColor White
    Write-Host "Registros com cliente_fatura: $($debugResponse.estatisticas.registrosComClienteFatura)" -ForegroundColor White
    Write-Host "Registros sem cliente: $($debugResponse.estatisticas.registrosSemCliente)" -ForegroundColor White
    Write-Host "Clientes únicos (cadastro): $($debugResponse.estatisticas.clientesUnicosCadastro)" -ForegroundColor White
    Write-Host "Clientes únicos (fatura): $($debugResponse.estatisticas.clientesUnicosFatura)" -ForegroundColor White
    
    if ($debugResponse.amostraDados -and $debugResponse.amostraDados.Length -gt 0) {
        Write-Host "`n📋 Amostra dos dados:" -ForegroundColor Cyan
        $debugResponse.amostraDados | Select-Object -First 3 | Format-Table -AutoSize
    }
}
catch {
    Write-Host "❌ Erro no debug: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "Verifique se:" -ForegroundColor Yellow
    Write-Host "  - O servidor está rodando (npm run dev)" -ForegroundColor Yellow
    Write-Host "  - A view view_faturas_completa existe no Supabase" -ForegroundColor Yellow
    Write-Host "  - Execute o arquivo supabase/verify_and_create_view.sql" -ForegroundColor Yellow
}

Write-Host "`n2. Testando endpoint de métricas..." -ForegroundColor Yellow

try {
    $metricsResponse = Invoke-RestMethod -Uri $metricsUrl -Method GET -ContentType "application/json"
    
    Write-Host "✅ Metrics API funcionando!" -ForegroundColor Green
    Write-Host "Total de clientes: $($metricsResponse.metricas.totalClientes)" -ForegroundColor White
    Write-Host "Total de UCs: $($metricsResponse.metricas.totalUCs)" -ForegroundColor White
    Write-Host "UCs com problema: $($metricsResponse.metricas.ucsInjetadoZero)" -ForegroundColor White
    Write-Host "Taxa de problema: $($metricsResponse.metricas.taxaProblema.ToString('F2'))%" -ForegroundColor White
    
    if ($metricsResponse.clientesAgrupados -and $metricsResponse.clientesAgrupados.Length -gt 0) {
        Write-Host "`n👥 Top 5 clientes:" -ForegroundColor Cyan
        $metricsResponse.clientesAgrupados | Select-Object -First 5 | 
            Select-Object cliente, totalUCs, ucsComProblema, @{Name="Taxa Problema %"; Expression={$_.porcentagemProblema.ToString("F1")}} |
            Format-Table -AutoSize
    }
}
catch {
    Write-Host "❌ Erro nas métricas: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`n=== TESTE CONCLUÍDO ===" -ForegroundColor Cyan
Write-Host "Para mais informações, acesse:" -ForegroundColor White
Write-Host "- Debug: $debugUrl" -ForegroundColor White
Write-Host "- Métricas: $metricsUrl" -ForegroundColor White

