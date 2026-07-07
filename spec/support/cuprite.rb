require "capybara/cuprite"
require "axe/cuprite/rspec"

Capybara.default_driver = :rack_test
Capybara.javascript_driver = :cuprite

Capybara.register_driver(:cuprite) do |app|
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

RSpec.configure do |config|
  config.before(:each, type: :system) do
    driven_by :cuprite
  end
end
