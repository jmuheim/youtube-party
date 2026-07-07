require "capybara/cuprite"
require "axe/cuprite/rspec"

# Registered under a custom name (:cuprite_custom) deliberately, NOT :cuprite:
# rspec-rails' `driven_by` delegates to ActionDispatch::SystemTesting::Driver,
# which re-registers built-in driver names (:cuprite, :selenium, :rack_test,
# :playwright) with its own vanilla options on every system test — silently
# discarding everything configured here. A non-built-in name fails its
# `registerable?` check, so `driven_by` falls through to this registration.
Capybara.register_driver(:cuprite_custom) do |app|
  Capybara::Cuprite::Driver.new(
    app,
    window_size: [ 1280, 800 ],
    browser_options: { "no-sandbox": nil },
    headless: true,
    # Generous timeouts for slow shared CI runners: Chrome can take >10s
    # (Ferrum's default process_timeout) just to boot there, which fails the
    # first browser spec of the run with Ferrum::ProcessTimeoutError.
    process_timeout: 30,
    timeout: 15
  )
end

Capybara.default_driver = :rack_test
Capybara.javascript_driver = :cuprite_custom

RSpec.configure do |config|
  config.before(:each, type: :system) do
    driven_by :cuprite_custom
  end
end
