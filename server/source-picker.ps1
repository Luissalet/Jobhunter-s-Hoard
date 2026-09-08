param([ValidateSet('file', 'folder')][string]$Kind)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.Application]::EnableVisualStyles()
$owner = [System.Windows.Forms.Form]::new()
$owner.Text = "Jubhunter's Hoard"
$owner.ShowInTaskbar = $false
$owner.TopMost = $true
$owner.Opacity = 0
$owner.StartPosition = 'CenterScreen'
$dialog = $null
try {
    if ($Kind -eq 'folder') {
        $dialog = [System.Windows.Forms.FolderBrowserDialog]::new()
        $dialog.Description = 'Elegir carpeta para Jubhunter''s Hoard'
        $dialog.ShowNewFolderButton = $false
        if ($dialog.PSObject.Properties['UseDescriptionForTitle']) {
            $dialog.UseDescriptionForTitle = $true
        }
    } else {
        $dialog = [System.Windows.Forms.OpenFileDialog]::new()
        $dialog.Title = 'Elegir archivo para Jubhunter''s Hoard'
        $dialog.Filter = 'Documentos y codigo|*.pdf;*.docx;*.md;*.txt;*.csv;*.tsv;*.py;*.js;*.ts;*.jsx;*.tsx;*.html;*.css|Todos los archivos|*.*'
        $dialog.CheckFileExists = $true
        $dialog.Multiselect = $false
    }
    $owner.Show()
    $owner.Activate()
    $selectedPath = $null
    if ($dialog.ShowDialog($owner) -eq [System.Windows.Forms.DialogResult]::OK) {
        $selectedPath = if ($Kind -eq 'folder') { $dialog.SelectedPath } else { $dialog.FileName }
    }
    @{ path = $selectedPath } | ConvertTo-Json -Compress
} finally {
    if ($dialog) { $dialog.Dispose() }
    $owner.Dispose()
}
